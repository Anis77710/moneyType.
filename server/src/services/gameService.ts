import type {
  GameCountdownState,
  GameStartPayload,
  LeaderboardEntry,
  PlayerProgressUpdate,
  PlayerState,
} from '../../../shared/types.js'
import { DEFAULTS, ServerEvents } from '../../../shared/types.js'
import { Logger } from '../logger.js'
import type { ProgressInput } from '../validation/schema.js'
import { validateProgressInput } from '../validation/schema.js'
import { Anticheat } from '../security/anticheat.js'
import type { InternalRoom, RoomService } from './roomService.js'
import { RoomError } from './roomService.js'
import { TextService } from './textService.js'

export interface GameServiceDeps {
  textService: TextService
  logger?: Logger
  now?: () => number
  setTimeoutFn?: (fn: () => void, ms: number) => NodeJS.Timeout
  clearTimeoutFn?: (t: NodeJS.Timeout) => void
  /** Optional persistence hook; failures are logged, never fatal. */
  onGameEnded?: (room: InternalRoom, results: LeaderboardEntry[]) => void | Promise<void>
}

/**
 * Owns the race lifecycle: countdown → synchronized start → progress
 * validation → finish detection → ranking → end. The server is the single
 * source of truth: clients only report raw character/word counters, and every
 * derived metric (WPM, accuracy, consistency, rank) is computed here.
 */
export class GameService {
  private roomService: RoomService | null = null
  private readonly textService: TextService
  private readonly logger: Logger
  private readonly now: () => number
  private readonly setTimeoutFn: (fn: () => void, ms: number) => NodeJS.Timeout
  private readonly clearTimeoutFn: (t: NodeJS.Timeout) => void
  private readonly onGameEnded?: (room: InternalRoom, results: LeaderboardEntry[]) => void | Promise<void>
  private readonly anticheat: Anticheat

  constructor(deps: GameServiceDeps) {
    this.textService = deps.textService
    this.logger = deps.logger ?? new Logger('info')
    this.now = deps.now ?? Date.now
    this.setTimeoutFn = deps.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms))
    this.clearTimeoutFn = deps.clearTimeoutFn ?? ((t) => clearTimeout(t))
    this.onGameEnded = deps.onGameEnded
    this.anticheat = new Anticheat({ logger: this.logger })
  }

  attach(roomService: RoomService): void {
    this.roomService = roomService
  }

  // -------------------------------------------------------------------------
  // Countdown & start
  // -------------------------------------------------------------------------

  startCountdown(room: InternalRoom, hostId: string): void {
    if (room.phase !== 'waiting') {
      throw new RoomError('GAME_IN_PROGRESS', 'A game is already running or starting.')
    }
    if (room.players.size < 2) {
      throw new RoomError('NOT_ENOUGH_READY', 'At least 2 players are required to start.')
    }
    const readyCount = [...room.players.values()].filter((p) => p.ready).length
    if (readyCount < room.settings.minReadyToStart) {
      throw new RoomError(
        'NOT_ENOUGH_READY',
        `Need at least ${room.settings.minReadyToStart} ready player(s); only ${readyCount} ready.`,
      )
    }

    const startedAt = this.now()
    const endsAt = startedAt + DEFAULTS.COUNTDOWN_MS
    const text = this.textService.generateText(room.settings)
    room.game = {
      phase: 'countdown',
      startedAt,
      endsAt,
      text,
      timer: null,
      ended: false,
    }
    room.phase = 'countdown'
    room.wpmSamples.clear()

    const countdown: GameCountdownState = { phase: 'countdown', startedAt, endsAt }
    this.roomService!.emitToRoom(room, ServerEvents.COUNTDOWN, countdown)

    room.game.timer = this.setTimeoutFn(() => {
      this.beginGame(room)
    }, DEFAULTS.COUNTDOWN_MS)
  }

  private beginGame(room: InternalRoom): void {
    const game = room.game
    if (!game || game.phase !== 'countdown' || room.phase !== 'countdown') return
    game.phase = 'running'
    room.phase = 'running'
    const startAt = this.now()
    // Real race clock anchor: elapsed time (and WPM) must not include the
    // countdown. Reconnecting clients also use these anchors to restore the
    // in-progress race exactly.
    game.startedAt = startAt

    const payload: GameStartPayload = {
      startAt,
      text: game.text,
      settings: room.settings,
      phase: 'running',
    }
    this.roomService!.emitToRoom(room, ServerEvents.GAME_START, payload)

    const timeoutMs = room.settings.mode === 'time'
      ? room.settings.duration * 1000
      : Math.max(60_000, Math.ceil((game.text.words.length / 8) * 60_000))
    game.endsAt = startAt + timeoutMs
    game.timer = this.setTimeoutFn(() => {
      this.endGame(room, 'time_expired')
    }, timeoutMs)
    this.logger.info('game started', { roomId: room.id, mode: room.settings.mode, players: room.players.size })
  }

  // -------------------------------------------------------------------------
  // Progress
  // -------------------------------------------------------------------------

  /**
   * Handles a progress report from a player. Every field is validated and
   * rate-limited; derived metrics are computed server-side only.
   */
  handleProgress(playerId: string, rawMsg: unknown): void {
    const room = this.roomService!.getRoomOfPlayer(playerId)
    if (!room || room.phase !== 'running' || !room.game || room.game.phase !== 'running') return

    const player = this.roomService!.getPlayer(room, playerId)
    if (!player || player.finished) return

    const input = validateProgressInput(rawMsg)
    if (!input) return

    const now = this.now()
    const elapsedMs = now - room.game.startedAt
    const verdict = this.anticheat.verify(room, player, input, elapsedMs, now, room.game.text.words.length)
    if (!verdict.accepted) {
      if (verdict.clamped) this.applyProgress(room, player, verdict.clamped, now, elapsedMs)
      return
    }
    this.applyProgress(room, player, input, now, elapsedMs)
  }

  private applyProgress(room: InternalRoom, player: PlayerState, input: ProgressInput, now: number, elapsedMs: number): void {
    if (player.finished) return // idempotent: ignore updates after finish

    player.wordIndex = input.wordIndex
    player.typedCount = input.typedCount
    player.correctCount = input.correctCount
    player.incorrectCount = input.incorrectCount
    player.extraCount = input.extraCount
    player.missedCount = input.missedCount
    player.lastSeenAt = now

    const elapsedSec = Math.max(0.1, elapsedMs / 1000)
    const gross = player.typedCount
    const net = Math.max(0, player.correctCount)
    player.rawWpm = Math.round((gross / 5) / (elapsedSec / 60))
    player.wpm = Math.min(DEFAULTS.MAX_REPORTED_WPM, Math.round((net / 5) / (elapsedSec / 60)))
    const totalWrong = player.incorrectCount + player.extraCount + player.missedCount
    player.accuracy = gross > 0 ? Math.round((net / (net + totalWrong)) * 100) : 100
    player.progressPct = Math.min(100, Math.round((input.wordIndex / room.game!.text.words.length) * 100))

    // Per-second raw-WPM sample for consistency scoring.
    const bucket = Math.floor(elapsedMs / 1000)
    let samples = room.wpmSamples.get(player.id)
    if (!samples) {
      samples = new Map()
      room.wpmSamples.set(player.id, samples)
    }
    samples.set(bucket, Math.max(samples.get(bucket) ?? 0, player.rawWpm))

    const reachedEnd = input.wordIndex >= room.game!.text.words.length
    if (input.finished && reachedEnd) {
      player.finished = true
      player.finishTimeMs = elapsedMs
      player.progressPct = 100
      this.logger.info('player finished', { roomId: room.id, playerId: player.id, timeMs: elapsedMs })
      this.roomService!.emitToRoom(room, ServerEvents.LEADERBOARD, this.buildLeaderboard(room))
      if (this.allFinished(room)) this.endGame(room, 'all_finished')
    }

    const update: PlayerProgressUpdate = {
      playerId: player.id,
      wordIndex: player.wordIndex,
      wpm: player.wpm,
      rawWpm: player.rawWpm,
      accuracy: player.accuracy,
      progressPct: player.progressPct,
      finished: player.finished,
      finishTimeMs: player.finishTimeMs,
    }
    this.roomService!.emitToRoom(room, ServerEvents.PROGRESS, update)
  }

  // -------------------------------------------------------------------------
  // Finish & ranking
  // -------------------------------------------------------------------------

  private allFinished(room: InternalRoom): boolean {
    for (const p of room.players.values()) {
      if (!p.finished) return false
    }
    return true
  }

  /**
   * Builds the ranked leaderboard. Single source of truth for ranking:
   * finished players by finish time, then unfinished players by progress.
   */
  buildLeaderboard(room: InternalRoom): LeaderboardEntry[] {
    const players = [...room.players.values()]
    const finished = players
      .filter((p) => p.finished)
      .sort((a, b) => (a.finishTimeMs ?? Infinity) - (b.finishTimeMs ?? Infinity))
    const unfinished = players
      .filter((p) => !p.finished)
      .sort((a, b) => {
        const byProgress = b.progressPct - a.progressPct
        if (byProgress !== 0) return byProgress
        const byCorrect = b.correctCount - a.correctCount
        if (byCorrect !== 0) return byCorrect
        return b.accuracy - a.accuracy
      })

    const elapsed = room.game ? Math.max(1, Math.round((this.now() - room.game.startedAt) / 1000)) : 0

    let rank = 1
    const entries: LeaderboardEntry[] = []
    for (const p of [...finished, ...unfinished]) {
      entries.push({
        rank: rank++,
        playerId: p.id,
        displayName: p.displayName,
        avatarColor: p.avatarColor,
        isHost: p.isHost,
        finished: p.finished,
        finishTimeMs: p.finishTimeMs,
        wpm: p.finished ? p.wpm : 0,
        rawWpm: p.finished ? p.rawWpm : 0,
        accuracy: p.accuracy,
        correctCount: p.correctCount,
        incorrectCount: p.incorrectCount,
        extraCount: p.extraCount,
        missedCount: p.missedCount,
        consistency: this.computeConsistency(room, p),
        totalTimeSec: elapsed,
      })
    }
    return entries
  }

  private computeConsistency(room: InternalRoom, player: PlayerState): number {
    const samples = room.wpmSamples.get(player.id)
    if (!samples || samples.size < 2) return 100
    const values = [...samples.values()]
    const mean = values.reduce((s, v) => s + v, 0) / values.length
    if (mean <= 0) return 100
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
    const stddev = Math.sqrt(variance)
    return Math.round((mean / (mean + stddev)) * 100)
  }

  /**
   * Ends the game exactly once (idempotent). Broadcasts the final leaderboard.
   */
  endGame(room: InternalRoom, reason: 'all_finished' | 'time_expired'): void {
    const game = room.game
    if (!game || game.ended) return
    game.ended = true
    game.phase = 'ended'
    room.phase = 'finished'
    if (game.timer) {
      this.clearTimeoutFn(game.timer)
      game.timer = null
    }
    const entries = this.buildLeaderboard(room)
    this.roomService!.emitToRoom(room, ServerEvents.GAME_ENDED, entries)
    this.logger.info('game ended', { roomId: room.id, reason, players: room.players.size })

    if (this.onGameEnded) {
      void Promise.resolve(this.onGameEnded(room, entries)).catch((err: unknown) => {
        this.logger.warn('persistence hook failed', { roomId: room.id, error: String(err) })
      })
    }
  }

  /** Called by RoomService when a player is removed mid-game (ghosted). */
  onPlayerRemoved(room: InternalRoom, player: PlayerState): void {
    if (room.phase !== 'running' || !room.game || room.game.ended) return
    this.roomService!.emitToRoom(room, ServerEvents.PROGRESS, {
      playerId: player.id,
      wordIndex: player.wordIndex,
      wpm: 0,
      rawWpm: 0,
      accuracy: player.accuracy,
      progressPct: player.progressPct,
      finished: true,
      finishTimeMs: null,
    } satisfies PlayerProgressUpdate)
  }

  /** Resets a room to the lobby after "Play Again" / "Return to Lobby". */
  resetToLobby(room: InternalRoom): void {
    this.teardownGame(room)
    room.phase = 'waiting'
    room.wpmSamples.clear()
    for (const player of room.players.values()) {
      player.ready = false
      player.wordIndex = 0
      player.typedCount = 0
      player.correctCount = 0
      player.incorrectCount = 0
      player.extraCount = 0
      player.missedCount = 0
      player.wpm = 0
      player.rawWpm = 0
      player.accuracy = 100
      player.consistency = 100
      player.progressPct = 0
      player.finished = false
      player.finishTimeMs = null
    }
    this.roomService!.emitRoomState(room)
  }

  /** Cancels all game timers without touching player state. */
  teardownGame(room: InternalRoom): void {
    const game = room.game
    if (game?.timer) {
      this.clearTimeoutFn(game.timer)
      game.timer = null
    }
    room.game = null
  }
}
