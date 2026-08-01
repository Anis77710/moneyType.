/**
 * Shared types for the real-time multiplayer racing system.
 * Used by both the server (authoritative) and the web client.
 */

export type GameMode = 'words' | 'time' | 'quote'
export type GameLanguage = 'english' | 'spanish' | 'french' | 'german'
export type RoomVisibility = 'public' | 'private'
export type RoomPhase = 'waiting' | 'countdown' | 'running' | 'finished'
export type DisconnectReason = 'transport close' | 'transport error' | 'ping timeout' | 'client namespace disconnect' | 'server namespace disconnect' | 'kick' | 'replace'

export interface RoomSettings {
  /** Time mode duration in seconds (only used when mode === 'time'). */
  duration: number
  /** Word mode word count (only used when mode === 'words'). */
  wordCount: number
  language: GameLanguage
  mode: GameMode
  /** Maximum players, configurable per room. */
  maxPlayers: number
  /** Minimum number of ready players required to start. */
  minReadyToStart: number
}

/** Server-computed progress snapshot for a single player. */
export interface PlayerState {
  /** Server-generated unique session id (survives reconnects within the grace window). */
  id: string
  /** Optional auth user id (Supabase uid when signed in). */
  userId: string | null
  displayName: string
  avatarColor: string
  ready: boolean
  connected: boolean
  isHost: boolean
  /** Milliseconds since Unix epoch of the last liveness signal. */
  lastSeenAt: number
  /** Latest measured round-trip latency in ms (cosmetic only). */
  pingMs: number | null

  // --- authoritative progress (server-computed, never trusted from clients) ---
  wordIndex: number
  typedCount: number
  correctCount: number
  incorrectCount: number
  extraCount: number
  missedCount: number
  wpm: number
  rawWpm: number
  accuracy: number
  consistency: number
  /** Percentage of the test completed, 0-100. */
  progressPct: number
  finished: boolean
  /** Milliseconds from server start timestamp to finish (null until finished). */
  finishTimeMs: number | null
}

export interface RoomSnapshot {
  id: string
  code: string
  name: string
  hostId: string
  visibility: RoomVisibility
  phase: RoomPhase
  settings: RoomSettings
  createdAt: number
  players: PlayerState[]
}

/** A sanitized room summary for the public room browser (no private rooms). */
export interface PublicRoomSummary {
  id: string
  code: string
  name: string
  hostName: string
  players: number
  maxPlayers: number
  mode: GameMode
  language: GameLanguage
  visibility: RoomVisibility
}

export interface GameText {
  words: string[]
  /** Join of words with single spaces; used by the client for rendering. */
  raw: string
  /** djb2 hash of raw — lets clients verify they got the exact same text. */
  hash: number
  mode: GameMode
}

export interface GameCountdownState {
  phase: 'countdown'
  /** Server clock (ms) when the countdown started. */
  startedAt: number
  /** Server clock (ms) when typing begins. */
  endsAt: number
}

export interface GameStartPayload {
  startAt: number
  text: GameText
  settings: RoomSettings
  phase: 'running'
}

/** Per-player live race update broadcast to the room. */
export interface PlayerProgressUpdate {
  playerId: string
  wordIndex: number
  wpm: number
  rawWpm: number
  accuracy: number
  progressPct: number
  finished: boolean
  finishTimeMs: number | null
}

export interface LeaderboardEntry {
  rank: number
  playerId: string
  displayName: string
  avatarColor: string
  isHost: boolean
  finished: boolean
  finishTimeMs: number | null
  wpm: number
  rawWpm: number
  accuracy: number
  correctCount: number
  incorrectCount: number
  extraCount: number
  missedCount: number
  consistency: number
  /** Total elapsed time in seconds for time-mode games. */
  totalTimeSec: number
}

export interface RoomClosedPayload {
  reason: 'host_closed' | 'empty' | 'server_shutdown' | 'kicked' | 'expired'
}

export interface ServerErrorPayload {
  code: ServerErrorCode
  message: string
}

export type ServerErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_ARGUMENT'
  | 'ROOM_FULL'
  | 'NAME_TAKEN'
  | 'ALREADY_IN_ROOM'
  | 'GAME_IN_PROGRESS'
  | 'NOT_ENOUGH_READY'
  | 'NOT_HOST'
  | 'INVALID_TOKEN'
  | 'RATE_LIMITED'
  | 'INVALID_STATE'

/** Client → server socket events. */
export const ClientEvents = {
  CREATE_ROOM: 'room:create',
  JOIN_ROOM: 'room:join',
  REJOIN_ROOM: 'room:rejoin',
  LEAVE_ROOM: 'room:leave',
  KICK_PLAYER: 'room:kick',
  SET_READY: 'room:ready',
  UPDATE_SETTINGS: 'room:settings',
  START_GAME: 'room:start',
  DELETE_ROOM: 'room:delete',
  PLAY_AGAIN: 'room:play_again',
  RETURN_TO_LOBBY: 'room:return_to_lobby',
  PROGRESS: 'game:progress',
  PING: 'net:ping',
  PING_REPORT: 'net:ping_report',
  REQUEST_ROOMS: 'rooms:list',
} as const

/** Server → client socket events. */
export const ServerEvents = {
  ROOM_SNAPSHOT: 'room:snapshot',
  ROOM_STATE: 'room:state',
  ROOM_LIST: 'rooms:list',
  ROOM_CLOSED: 'room:closed',
  ERROR: 'room:error',
  COUNTDOWN: 'game:countdown',
  GAME_START: 'game:start',
  PROGRESS: 'game:progress',
  LEADERBOARD: 'game:leaderboard',
  GAME_ENDED: 'game:ended',
  KICKED: 'room:kicked',
  PONG: 'net:pong',
} as const

export const DEFAULTS = {
  MAX_PLAYERS: 8,
  MIN_PLAYERS: 2,
  MIN_READY_TO_START: 2,
  ROOM_NAME_MAX: 40,
  DISPLAY_NAME_MAX: 24,
  /** How long a disconnected player is kept before removal (ms). */
  DISCONNECT_GRACE_MS: 30_000,
  /** Timeout for the initial join handshake (ms). */
  JOIN_TIMEOUT_MS: 10_000,
  COUNTDOWN_MS: 3_000,
  COUNTDOWN_STEPS: 3,
  /** Max progress events per second a client may send. */
  MAX_PROGRESS_PER_SEC: 8,
  /** Max characters per second the server will believe (≈360 WPM). */
  MAX_CHARS_PER_SEC: 30,
  /** Max raw WPM the server will ever report (defense in depth). */
  MAX_REPORTED_WPM: 300,
  /** Minimum time (ms) between two progress broadcasts per player. */
  PROGRESS_BROADCAST_MIN_MS: 200,
  PING_INTERVAL_MS: 2_000,
  PING_TIMEOUT_MS: 10_000,
  ROOM_LIST_LIMIT: 50,
  ROOM_CODE_LENGTH: 6,
  /** A room that never gets a second player is auto-closed after this (ms). */
  EMPTY_ROOM_TTL_MS: 5 * 60_000,
} as const
