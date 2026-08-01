import type {
  GameCountdownState,
  GameStartPayload,
  LeaderboardEntry,
  PlayerState,
  PublicRoomSummary,
  RoomClosedPayload,
  RoomPhase,
  RoomSettings,
  RoomSnapshot,
  RoomVisibility,
} from '../../../shared/types.js'
import { ClientEvents, DEFAULTS, ServerEvents } from '../../../shared/types.js'
import { Logger } from '../logger.js'
import { generatePlayerId, generateReconnectToken, generateRoomCode, pickAvatarColor } from '../utils/id.js'
import type { GameService } from './gameService.js'
import { TextService } from './textService.js'

export const AVATAR_PALETTE = [
  '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff',
  '#5f27cd', '#01a3a4', '#1dd1a1', '#f368e0', '#ff9f43',
] as const

export interface JoinOutcome {
  room: InternalRoom
  playerId: string
  reconnectToken: string
}

export interface RejoinOutcome {
  room: InternalRoom
  playerId: string
}

/** Errors surfaced to the client with a stable machine-readable code. */
export class RoomError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

/** Domain event bus implemented by the socket layer (keeps services IO-free). */
export interface BroadcastBus {
  toRoom(roomId: string, event: string, payload: unknown): void
  toPlayer(roomId: string, playerId: string, event: string, payload: unknown): void
  toPlayerSockets(roomId: string, playerId: string, event: string, payload: unknown): void
  /** Force-disconnects every raw socket currently bound to a player. */
  disconnectPlayerSockets(roomId: string, playerId: string): void
}

const NOOP_BUS: BroadcastBus = {
  toRoom: () => {},
  toPlayer: () => {},
  toPlayerSockets: () => {},
  disconnectPlayerSockets: () => {},
}

export interface InternalGame {
  phase: 'countdown' | 'running' | 'ended'
  startedAt: number
  endsAt: number
  text: ReturnType<TextService['generateText']>
  timer: NodeJS.Timeout | null
  ended: boolean
}

export interface InternalRoom {
  id: string
  code: string
  name: string
  hostId: string
  visibility: RoomVisibility
  phase: RoomPhase
  settings: RoomSettings
  createdAt: number
  players: Map<string, PlayerState>
  /** auth userId -> playerId (prevents duplicate auth users joining twice). */
  playerByUserId: Map<string, string>
  /** socketId -> playerId. */
  socketBindings: Map<string, string>
  /** playerId -> reconnect token. */
  reconnectTokens: Map<string, string>
  /** playerId -> pending removal timer after disconnect. */
  disconnectTimers: Map<string, NodeJS.Timeout>
  /** Timer that auto-closes a room nobody joins within EMPTY_ROOM_TTL_MS. */
  cleanupTimer: NodeJS.Timeout | null
  game: InternalGame | null
  /** Per-second WPM samples used for consistency, playerId -> bucket -> wpm. */
  wpmSamples: Map<string, Map<number, number>>
}

export interface RoomServiceDeps {
  bus?: BroadcastBus
  gameService: GameService
  logger?: Logger
  /** Injectable clock for tests. */
  now?: () => number
  /** Injectable timers for tests. */
  setTimeoutFn?: (fn: () => void, ms: number) => NodeJS.Timeout
  clearTimeoutFn?: (t: NodeJS.Timeout) => void
  rng?: () => number
  /** How long a disconnected player is kept before removal (ms). */
  disconnectGraceMs?: number
  /** Optional persistence hook; failures are logged, never fatal. */
  persistence?: {
    onGameEnded?(room: InternalRoom, results: LeaderboardEntry[]): void | Promise<void>
  }
}

export interface CreateRoomInput {
  displayName: string
  userId: string | null
  name: string
  visibility: RoomVisibility
  settings: RoomSettings
}

/**
 * In-memory room registry. Node's single-threaded event loop guarantees that
 * all mutations are atomic with respect to each other, so there are no
 * interleaving races. All timers are tracked per room and cleaned up on
 * removal to prevent leaks.
 */
export class RoomService {
  private readonly rooms = new Map<string, InternalRoom>()
  /** O(1) playerId -> roomId index (keeps disconnect/kick fast at scale). */
  private readonly playerRoomIndex = new Map<string, string>()
  private bus: BroadcastBus = NOOP_BUS
  private readonly gameService: GameService
  private readonly logger: Logger
  private readonly now: () => number
  private readonly setTimeoutFn: (fn: () => void, ms: number) => NodeJS.Timeout
  private readonly clearTimeoutFn: (t: NodeJS.Timeout) => void
  private readonly rng: () => number
  private readonly persistence?: RoomServiceDeps['persistence']
  private readonly disconnectGraceMs: number

  constructor(deps: RoomServiceDeps) {
    this.bus = deps.bus ?? NOOP_BUS
    this.gameService = deps.gameService
    this.logger = deps.logger ?? new Logger('info')
    this.now = deps.now ?? Date.now
    this.setTimeoutFn = deps.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms))
    this.clearTimeoutFn = deps.clearTimeoutFn ?? ((t) => clearTimeout(t))
    this.rng = deps.rng ?? Math.random
    this.persistence = deps.persistence
    this.disconnectGraceMs = deps.disconnectGraceMs ?? DEFAULTS.DISCONNECT_GRACE_MS
    this.gameService.attach(this)
  }

  /** Injects the concrete broadcast bus (socket layer) after construction. */
  setBus(bus: BroadcastBus): void {
    this.bus = bus
  }

  // -------------------------------------------------------------------------
  // Room lifecycle
  // -------------------------------------------------------------------------

  createRoom(input: CreateRoomInput): JoinOutcome {
    const settings: RoomSettings = {
      mode: input.settings.mode,
      duration: input.settings.duration,
      wordCount: input.settings.wordCount,
      language: input.settings.language,
      maxPlayers: clampInt(input.settings.maxPlayers, 2, 16, DEFAULTS.MAX_PLAYERS),
      minReadyToStart: clampInt(input.settings.minReadyToStart, 1, 16, DEFAULTS.MIN_READY_TO_START),
    }
    settings.minReadyToStart = Math.min(settings.minReadyToStart, settings.maxPlayers)

    const code = this.generateUniqueCode()
    const roomId = generatePlayerId()
    const host = this.createPlayerState(input.displayName, input.userId)
    host.ready = false
    host.isHost = true
    host.connected = true
    const token = generateReconnectToken()

    const room: InternalRoom = {
      id: roomId,
      code,
      name: input.name,
      hostId: host.id,
      visibility: input.visibility,
      phase: 'waiting',
      settings,
      createdAt: this.now(),
      players: new Map([[host.id, host]]),
      playerByUserId: new Map(),
      socketBindings: new Map(),
      reconnectTokens: new Map([[host.id, token]]),
      disconnectTimers: new Map(),
      cleanupTimer: null,
      game: null,
      wpmSamples: new Map(),
    }
    if (host.userId) room.playerByUserId.set(host.userId, host.id)
    this.rooms.set(room.id, room)
    this.playerRoomIndex.set(host.id, room.id)
    room.cleanupTimer = this.setTimeoutFn(() => this.expireIfUnjoined(room), DEFAULTS.EMPTY_ROOM_TTL_MS)

    this.logger.info('room created', { roomId: room.id, code: room.code, visibility: room.visibility })
    return { room, playerId: host.id, reconnectToken: token }
  }

  joinRoom(displayName: string, userId: string | null, rawCode: string): JoinOutcome {
    const code = rawCode.trim().toUpperCase()
    const room = this.findByCode(code)
    if (!room) throw new RoomError('NOT_FOUND', `Room ${code} does not exist.`)

    if (room.phase !== 'waiting') {
      throw new RoomError('GAME_IN_PROGRESS', 'This room is already in a game.')
    }
    if (room.players.size >= room.settings.maxPlayers) {
      throw new RoomError('ROOM_FULL', `Room ${code} is full (${room.settings.maxPlayers} players).`)
    }
    if (userId) {
      const existing = room.playerByUserId.get(userId)
      if (existing) {
        throw new RoomError('ALREADY_IN_ROOM', 'You already have a player in this room.')
      }
    }
    if (this.hasName(room, displayName)) {
      throw new RoomError('NAME_TAKEN', `The name "${displayName}" is already taken in this room.`)
    }

    const player = this.createPlayerState(displayName, userId)
    const token = generateReconnectToken()
    room.players.set(player.id, player)
    room.reconnectTokens.set(player.id, token)
    this.playerRoomIndex.set(player.id, room.id)
    if (userId) room.playerByUserId.set(userId, player.id)

    // A second player means the room is being used — stop the auto-close timer.
    if (room.players.size > 1 && room.cleanupTimer) {
      this.clearTimeoutFn(room.cleanupTimer)
      room.cleanupTimer = null
    }

    this.emitRoomState(room)
    this.logger.info('player joined', { roomId: room.id, playerId: player.id })
    return { room, playerId: player.id, reconnectToken: token }
  }

  /**
   * Reconnects a player (browser refresh, brief network drop). Validates the
   * reconnect token so clients cannot hijack another player's session.
   */
  rejoinPlayer(rawCode: string, playerId: string, token: string): RejoinOutcome {
    const code = rawCode.trim().toUpperCase()
    const room = this.findByCode(code)
    if (!room) throw new RoomError('NOT_FOUND', `Room ${code} does not exist.`)
    const player = room.players.get(playerId)
    if (!player) throw new RoomError('NOT_FOUND', 'Player session not found.')
    const storedToken = room.reconnectTokens.get(playerId)
    if (!storedToken || storedToken !== token) {
      throw new RoomError('INVALID_TOKEN', 'Reconnect token rejected.')
    }
    this.cancelDisconnectTimer(room, playerId)
    player.connected = true
    player.lastSeenAt = this.now()
    this.logger.info('player rejoined', { roomId: room.id, playerId })
    return { room, playerId }
  }

  bindSocket(roomId: string, playerId: string, socketId: string): void {
    const room = this.rooms.get(roomId)
    if (!room) return
    room.socketBindings.set(socketId, playerId)
    room.players.get(playerId)!.lastSeenAt = this.now()
    this.emitRoomState(room)
  }

  unbindSocket(socketId: string): string | null {
    for (const room of this.rooms.values()) {
      const playerId = room.socketBindings.get(socketId)
      if (playerId) {
        room.socketBindings.delete(socketId)
        return playerId
      }
    }
    return null
  }

  /** Called by the socket layer on raw disconnect. */
  handleDisconnect(socketId: string, reason: string): void {
    const { room, playerId } = this.resolveBySocket(socketId)
    if (!room || !playerId) return
    // Socket was replaced by a newer connection (multi-tab) — ignore.
    if (room.socketBindings.get(socketId) !== playerId) return
    room.socketBindings.delete(socketId)

    const player = room.players.get(playerId)
    if (!player) return
    player.connected = false
    player.lastSeenAt = this.now()
    this.logger.info('player disconnected', { roomId: room.id, playerId, reason })

    // Host disconnect → transfer host before any removal can happen.
    if (room.hostId === playerId) this.transferHost(room, playerId)

    // During a game, a transient disconnect should not destroy the player's
    // race progress; removal only happens after the grace window.
    this.scheduleDisconnectTimer(room, playerId)
    this.emitRoomState(room)
  }

  leaveRoom(playerId: string): void {
    const { room } = this.resolveByPlayerId(playerId)
    if (!room) return
    this.removePlayer(room, playerId, 'left')
  }

  kickPlayer(hostId: string, targetId: string): void {
    const room = this.requireRoomOf(hostId)
    if (room.hostId !== hostId) {
      throw new RoomError('NOT_HOST', 'Only the host can kick players.')
    }
    if (targetId === hostId) throw new RoomError('INVALID_ARGUMENT', 'Hosts cannot kick themselves.')
    if (!room.players.has(targetId)) throw new RoomError('NOT_FOUND', 'Player not found in this room.')
    this.logger.info('player kicked', { roomId: room.id, targetId, hostId })
    this.removePlayer(room, targetId, 'kick')
  }

  deleteRoom(room: InternalRoom, reason: 'host_closed' | 'empty' | 'server_shutdown' | 'expired'): void {
    this.bus.toRoom(room.id, ServerEvents.ROOM_CLOSED, { reason } satisfies RoomClosedPayload)
    this.teardownRoom(room)
    this.logger.info('room closed', { roomId: room.id, reason })
  }

  /** Host-only: close the room for everyone. */
  deleteRoomByHost(hostId: string): void {
    const room = this.requireRoomOf(hostId)
    if (room.hostId !== hostId) throw new RoomError('NOT_HOST', 'Only the host can delete the room.')
    this.logger.info('room deleted by host', { roomId: room.id })
    this.deleteRoom(room, 'host_closed')
  }

  /**
   * Auto-close for rooms that never got a second player: only fires while the
   * room is still waiting and still solo, so an active lobby is never touched.
   */
  private expireIfUnjoined(room: InternalRoom): void {
    if (!this.rooms.has(room.id)) return
    if (room.phase !== 'waiting') return
    if (room.players.size > 1) return
    this.logger.info('room expired (never joined)', { roomId: room.id })
    this.deleteRoom(room, 'expired')
  }

  // -------------------------------------------------------------------------
  // Host controls
  // -------------------------------------------------------------------------

  updateSettings(hostId: string, patch: Partial<RoomSettings>): RoomSettings {
    const room = this.requireRoomOf(hostId)
    if (room.hostId !== hostId) throw new RoomError('NOT_HOST', 'Only the host can change settings.')
    if (room.phase !== 'waiting') {
      throw new RoomError('GAME_IN_PROGRESS', 'Settings cannot change while a game is running.')
    }
    const next: RoomSettings = { ...room.settings, ...patch }
    next.maxPlayers = clampInt(next.maxPlayers, 2, 16, room.settings.maxPlayers)
    next.minReadyToStart = clampInt(next.minReadyToStart, 1, next.maxPlayers, room.settings.minReadyToStart)
    if (next.maxPlayers < room.players.size) {
      throw new RoomError('INVALID_ARGUMENT', 'maxPlayers cannot be lower than the current player count.')
    }
    room.settings = next
    this.emitRoomState(room)
    return next
  }

  setReady(playerId: string, ready: boolean): void {
    const { room } = this.resolveByPlayerId(playerId)
    if (!room) return
    if (room.phase !== 'waiting') return
    const player = room.players.get(playerId)
    if (!player) return
    player.ready = ready
    player.lastSeenAt = this.now()
    this.emitRoomState(room)
  }

  updatePing(playerId: string, pingMs: number): void {
    const { room } = this.resolveByPlayerId(playerId)
    const player = room?.players.get(playerId)
    if (!player) return
    player.pingMs = pingMs
    player.lastSeenAt = this.now()
  }

  /**
   * State needed by a reconnecting client to restore an in-progress game
   * (countdown or running): timing anchors + the exact game text.
   */
  getGameStateForReconnect(roomId: string): {
    phase: RoomPhase
    startedAt: number
    endsAt: number
    text: { words: string[]; raw: string; hash: number; mode: string } | null
  } | null {
    const room = this.rooms.get(roomId)
    if (!room) return null
    const game = room.game
    if (!game) return { phase: room.phase, startedAt: 0, endsAt: 0, text: null }
    return {
      phase: room.phase,
      startedAt: game.startedAt,
      endsAt: game.endsAt,
      text: game.text,
    }
  }

  // -------------------------------------------------------------------------
  // Game lifecycle delegation
  // -------------------------------------------------------------------------

  startGame(hostId: string): void {
    const room = this.requireRoomOf(hostId)
    if (room.hostId !== hostId) throw new RoomError('NOT_HOST', 'Only the host can start the game.')
    this.gameService.startCountdown(room, hostId)
  }

  playAgain(hostId: string): void {
    const room = this.requireRoomOf(hostId)
    if (room.hostId !== hostId) throw new RoomError('NOT_HOST', 'Only the host can restart.')
    this.gameService.resetToLobby(room)
  }

  returnToLobby(hostId: string): void {
    this.playAgain(hostId)
  }

  handleProgress(playerId: string, msg: unknown): void {
    this.gameService.handleProgress(playerId, msg)
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  listPublicRooms(limit: number): PublicRoomSummary[] {
    const summaries: PublicRoomSummary[] = []
    for (const room of this.rooms.values()) {
      if (room.visibility !== 'public' || room.phase !== 'waiting') continue
      const host = room.players.get(room.hostId)
      summaries.push({
        id: room.id,
        code: room.code,
        name: room.name,
        hostName: host?.displayName ?? 'Unknown',
        players: room.players.size,
        maxPlayers: room.settings.maxPlayers,
        mode: room.settings.mode,
        language: room.settings.language,
        visibility: room.visibility,
      })
      if (summaries.length >= limit) break
    }
    return summaries
  }

  getSnapshot(roomId: string, viewerPlayerId?: string): RoomSnapshot | null {
    const room = this.rooms.get(roomId)
    if (!room) return null
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      hostId: room.hostId,
      visibility: room.visibility,
      phase: room.phase,
      settings: room.settings,
      createdAt: room.createdAt,
      players: [...room.players.values()].map((p) => ({ ...p })),
    }
  }

  getRoomOfPlayer(playerId: string): InternalRoom | null {
    return this.resolveByPlayerId(playerId).room
  }

  getPlayer(room: InternalRoom, playerId: string): PlayerState | undefined {
    return room.players.get(playerId)
  }

  getTextHash(room: InternalRoom): number | null {
    return room.game?.text.hash ?? null
  }

  getSocketIdsForPlayer(room: InternalRoom, playerId: string): string[] {
    const ids: string[] = []
    for (const [socketId, bound] of room.socketBindings) {
      if (bound === playerId) ids.push(socketId)
    }
    return ids
  }

  /**
   * Number of connected players (not counting the grace-window disconnected).
   */
  connectedCount(room: InternalRoom): number {
    let count = 0
    for (const p of room.players.values()) {
      if (p.connected) count += 1
    }
    return count
  }

  get nowMs(): number {
    return this.now()
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private createPlayerState(displayName: string, userId: string | null): PlayerState {
    return {
      id: generatePlayerId(),
      userId,
      displayName,
      avatarColor: pickAvatarColor(displayName + (userId ?? ''), AVATAR_PALETTE),
      ready: false,
      connected: false,
      isHost: false,
      lastSeenAt: this.now(),
      pingMs: null,
      wordIndex: 0,
      typedCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      extraCount: 0,
      missedCount: 0,
      wpm: 0,
      rawWpm: 0,
      accuracy: 100,
      consistency: 100,
      progressPct: 0,
      finished: false,
      finishTimeMs: null,
    }
  }

  private generateUniqueCode(): string {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = generateRoomCode(DEFAULTS.ROOM_CODE_LENGTH)
      if (!this.findByCode(code)) return code
    }
    throw new RoomError('INVALID_ARGUMENT', 'Could not allocate a unique room code. Try again.')
  }

  private findByCode(code: string): InternalRoom | undefined {
    for (const room of this.rooms.values()) {
      if (room.code === code) return room
    }
    return undefined
  }

  private hasName(room: InternalRoom, displayName: string): boolean {
    const lower = displayName.toLowerCase()
    for (const p of room.players.values()) {
      if (p.displayName.toLowerCase() === lower) return true
    }
    return false
  }

  private requireRoomOf(playerId: string): InternalRoom {
    const { room } = this.resolveByPlayerId(playerId)
    if (!room) throw new RoomError('NOT_FOUND', 'You are not in a room.')
    return room
  }

  private resolveByPlayerId(playerId: string): { room: InternalRoom | null; playerId: string | null } {
    const roomId = this.playerRoomIndex.get(playerId)
    if (!roomId) return { room: null, playerId: null }
    const room = this.rooms.get(roomId)
    if (!room || !room.players.has(playerId)) {
      this.playerRoomIndex.delete(playerId)
      return { room: null, playerId: null }
    }
    return { room, playerId }
  }

  private resolveBySocket(socketId: string): { room: InternalRoom | null; playerId: string | null } {
    for (const room of this.rooms.values()) {
      const playerId = room.socketBindings.get(socketId)
      if (playerId) return { room, playerId }
    }
    return { room: null, playerId: null }
  }

  /** Removes a player immediately (leave/kick/grace-timeout) and cleans up. */
  removePlayer(room: InternalRoom, playerId: string, reason: 'left' | 'kick' | 'timeout'): void {
    const player = room.players.get(playerId)
    if (!player) return

    // Capture a ghost of their progress so the leaderboard still reflects
    // their performance if the game is running.
    this.gameService.onPlayerRemoved(room, player)

    this.cancelDisconnectTimer(room, playerId)
    room.players.delete(playerId)
    room.reconnectTokens.delete(playerId)
    room.wpmSamples.delete(playerId)
    this.playerRoomIndex.delete(playerId)
    if (player.userId) room.playerByUserId.delete(player.userId)
    let removedSocketIds: string[] = []
    for (const [socketId, bound] of room.socketBindings) {
      if (bound === playerId) {
        room.socketBindings.delete(socketId)
        removedSocketIds.push(socketId)
      }
    }
    if (removedSocketIds.length > 0) {
      this.bus.disconnectPlayerSockets(room.id, playerId)
    }

    if (room.players.size === 0) {
      this.deleteRoom(room, reason === 'left' ? 'empty' : 'host_closed')
      return
    }
    if (room.hostId === playerId) this.transferHost(room, playerId)
    this.emitRoomState(room)
    this.logger.info('player removed', { roomId: room.id, playerId, reason })
  }

  private transferHost(room: InternalRoom, leavingHostId: string): void {
    const next = [...room.players.values()]
      .filter((p) => p.id !== leavingHostId)
      .sort((a, b) => a.lastSeenAt - b.lastSeenAt)[0]
    if (!next) return
    const leaving = room.players.get(leavingHostId)
    if (leaving) leaving.isHost = false
    room.hostId = next.id
    next.isHost = true
    this.logger.info('host transferred', { roomId: room.id, from: leavingHostId, to: next.id })
  }

  private scheduleDisconnectTimer(room: InternalRoom, playerId: string): void {
    this.cancelDisconnectTimer(room, playerId)
    const timer = this.setTimeoutFn(() => {
      room.disconnectTimers.delete(playerId)
      const player = room.players.get(playerId)
      if (!player || player.connected) return
      // Only remove if the room still exists and the player hasn't returned.
      this.logger.info('disconnected player removed after grace', { roomId: room.id, playerId })
      this.removePlayer(room, playerId, 'timeout')
    }, this.disconnectGraceMs)
    room.disconnectTimers.set(playerId, timer)
  }

  private cancelDisconnectTimer(room: InternalRoom, playerId: string): void {
    const timer = room.disconnectTimers.get(playerId)
    if (timer) {
      this.clearTimeoutFn(timer)
      room.disconnectTimers.delete(playerId)
    }
  }

  /** Broadcasts the current room state (players, phase, settings) to the room. */
  emitRoomState(room: InternalRoom): void {
    const snapshot = this.getSnapshot(room.id)
    if (!snapshot) return
    this.bus.toRoom(room.id, ServerEvents.ROOM_STATE, snapshot)
  }

  emitToPlayer(room: InternalRoom, playerId: string, event: string, payload: unknown): void {
    this.bus.toPlayer(room.id, playerId, event, payload)
  }

  emitToRoom(room: InternalRoom, event: string, payload: unknown): void {
    this.bus.toRoom(room.id, event, payload)
  }

  // -------------------------------------------------------------------------
  // Teardown & lifecycle helpers
  // -------------------------------------------------------------------------

  /** Clears every timer and removes the room from the registry. */
  teardownRoom(room: InternalRoom): void {
    this.gameService.teardownGame(room)
    if (room.cleanupTimer) {
      this.clearTimeoutFn(room.cleanupTimer)
      room.cleanupTimer = null
    }
    for (const timer of room.disconnectTimers.values()) {
      this.clearTimeoutFn(timer)
    }
    for (const playerId of room.players.keys()) {
      this.playerRoomIndex.delete(playerId)
    }
    room.disconnectTimers.clear()
    room.players.clear()
    room.playerByUserId.clear()
    room.socketBindings.clear()
    room.reconnectTokens.clear()
    room.wpmSamples.clear()
    room.game = null
    this.rooms.delete(room.id)
  }

  closeAllRooms(reason: 'server_shutdown'): void {
    for (const room of [...this.rooms.values()]) {
      this.bus.toRoom(room.id, ServerEvents.ROOM_CLOSED, { reason } satisfies RoomClosedPayload)
      this.teardownRoom(room)
    }
    this.logger.info('all rooms closed', { reason })
  }

  get roomCount(): number {
    return this.rooms.size
  }

  /** Internal accessor for the game service. */
  _getRoomById(roomId: string): InternalRoom | undefined {
    return this.rooms.get(roomId)
  }

  _getAllRooms(): InternalRoom[] {
    return [...this.rooms.values()]
  }

  _resolvePlayer(playerId: string): { room: InternalRoom | null } {
    return this.resolveByPlayerId(playerId)
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(max, Math.max(min, n))
}
