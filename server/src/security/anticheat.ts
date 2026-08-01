import type { PlayerState } from '../../../shared/types.js'
import { DEFAULTS } from '../../../shared/types.js'
import { Logger } from '../logger.js'
import type { ProgressInput } from '../validation/schema.js'
import type { InternalRoom } from '../services/roomService.js'

export interface ProgressVerdict {
  accepted: boolean
  reason?: string
  /** When the event is plausible but slightly inflated, a clamped input is returned. */
  clamped?: ProgressInput
}

export interface AnticheatDeps {
  logger?: Logger
  now?: () => number
}

/**
 * Server-side integrity checks for race progress. The server never trusts the
 * client: only raw counters arrive over the wire, and every one is validated
 * for coherence, monotonicity and physical possibility. Suspicious activity is
 * logged with room/player context so it can be reviewed and rate-limited
 * accounts offline.
 */
export class Anticheat {
  private readonly logger: Logger
  private readonly now: () => number
  /** playerId -> timestamp of last accepted progress event. */
  private readonly lastEventAt = new Map<string, number>()

  constructor(deps: AnticheatDeps = {}) {
    this.logger = deps.logger ?? new Logger('info')
    this.now = deps.now ?? Date.now
  }

  /**
   * Verifies a progress report. Returns accepted=true for honest events, a
   * clamped variant for mildly inflated ones, or rejected for impossible ones.
   */
  verify(
    room: InternalRoom,
    player: PlayerState,
    input: ProgressInput,
    elapsedMs: number,
    nowMs: number,
    wordCount: number,
  ): ProgressVerdict {
    const last = this.lastEventAt.get(player.id) ?? 0
    const minGap = 1000 / DEFAULTS.MAX_PROGRESS_PER_SEC
    if (nowMs - last < minGap) {
      return { accepted: false, reason: 'rate_limited' }
    }

    // ---- monotonicity: progress can never go backwards ---------------------
    if (
      input.wordIndex < player.wordIndex ||
      input.typedCount < player.typedCount ||
      input.correctCount < player.correctCount ||
      input.incorrectCount < player.incorrectCount ||
      input.extraCount < player.extraCount ||
      input.missedCount < player.missedCount
    ) {
      return { accepted: false, reason: 'regression' }
    }

    // ---- bounds -------------------------------------------------------------
    if (input.wordIndex > wordCount) {
      this.logSuspicious(room, player, 'word_index_out_of_bounds', input)
      return { accepted: false, reason: 'word_index_out_of_bounds' }
    }
    if (input.correctCount + input.incorrectCount + input.extraCount > input.typedCount) {
      this.logSuspicious(room, player, 'counter_incoherence', input)
      return { accepted: false, reason: 'counter_incoherence' }
    }

    // ---- physical possibility (rate limit on typed characters) -------------
    const elapsedSec = Math.max(0, elapsedMs / 1000)
    const maxTyped = Math.floor(elapsedSec * DEFAULTS.MAX_CHARS_PER_SEC) + 4
    if (input.typedCount > maxTyped) {
      this.logSuspicious(room, player, 'impossible_typing_rate', { input, elapsedSec })
      return {
        accepted: false,
        reason: 'impossible_typing_rate',
        clamped: {
          ...input,
          typedCount: maxTyped,
          correctCount: Math.min(input.correctCount, maxTyped),
          incorrectCount: Math.min(input.incorrectCount, maxTyped),
          extraCount: Math.min(input.extraCount, Math.max(0, maxTyped - input.correctCount - input.incorrectCount)),
        },
      }
    }

    // ---- skipped words ------------------------------------------------------
    // Advancing N words requires typing at least N characters (one per word).
    const deltaWords = input.wordIndex - player.wordIndex
    const deltaTyped = input.typedCount - player.typedCount
    if (deltaWords > deltaTyped + 1) {
      this.logSuspicious(room, player, 'skipped_words', { input, deltaWords, deltaTyped })
      return {
        accepted: false,
        reason: 'skipped_words',
        clamped: { ...input, wordIndex: player.wordIndex + Math.max(0, deltaTyped + 1) },
      }
    }

    // ---- impossible completion ----------------------------------------------
    if (input.finished) {
      if (input.wordIndex < wordCount) {
        this.logSuspicious(room, player, 'early_finish', { input, wordCount })
        return { accepted: false, reason: 'early_finish', clamped: { ...input, finished: false } }
      }
      const totalChars = this.totalChars(room)
      const minFinishSec = totalChars / DEFAULTS.MAX_CHARS_PER_SEC
      if (elapsedSec < minFinishSec) {
        this.logSuspicious(room, player, 'impossible_finish_time', { elapsedSec, minFinishSec })
        return { accepted: false, reason: 'impossible_finish_time', clamped: { ...input, finished: false } }
      }
    }

    this.lastEventAt.set(player.id, nowMs)
    return { accepted: true }
  }

  /** Frees per-player state when a player leaves (prevents memory leaks). */
  forget(playerId: string): void {
    this.lastEventAt.delete(playerId)
  }

  private totalChars(room: InternalRoom): number {
    const words = room.game?.text.words ?? []
    return words.reduce((s, w) => s + w.length, 0) + Math.max(0, words.length - 1)
  }

  private logSuspicious(room: InternalRoom, player: PlayerState, reason: string, detail: unknown): void {
    this.logger.warn('suspicious progress rejected', {
      roomId: room.id,
      code: room.code,
      playerId: player.id,
      displayName: player.displayName,
      reason,
      detail: JSON.stringify(detail),
    })
  }
}
