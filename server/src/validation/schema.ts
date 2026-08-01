import type { GameLanguage, GameMode, RoomSettings, RoomVisibility } from '../../../shared/types.js'

/**
 * Every value that arrives over the socket is sanitized and validated here.
 * Invalid payloads are silently ignored (or logged by the handler) — they
 * never reach the services in a malformed shape.
 */

export interface ProgressInput {
  wordIndex: number
  typedCount: number
  correctCount: number
  incorrectCount: number
  extraCount: number
  missedCount: number
  finished: boolean
}

const MODES: readonly GameMode[] = ['words', 'time', 'quote']
const LANGUAGES: readonly GameLanguage[] = ['english', 'spanish', 'french', 'german']

export const ROOM_CODE_RE = /^[A-Z0-9]{4,8}$/i
export const PLAYER_ID_RE = /^[a-f0-9-]{36}$/
export const TOKEN_RE = /^[a-f0-9]{48}$/

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function sanitizeDisplayName(value: unknown, fallback = 'Player'): string {
  if (typeof value !== 'string') return fallback
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return cleaned.slice(0, 24) || fallback
}

export function sanitizeRoomName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return cleaned.slice(0, 40) || fallback
}

export function sanitizeRoomCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return ROOM_CODE_RE.test(code) ? code : null
}

export function sanitizePlayerId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return PLAYER_ID_RE.test(value) ? value : null
}

export function sanitizeReconnectToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return TOKEN_RE.test(value) ? value : null
}

function intIn(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function pickOne<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

export interface CreateRoomPayload {
  displayName: string
  userId: string | null
  name: string
  visibility: RoomVisibility
  settings: RoomSettings
}

/** Coerces an untrusted create-room payload into a safe shape. */
export function sanitizeCreateRoom(value: unknown, displayName: string, userId: string | null): CreateRoomPayload | null {
  if (!isRecord(value)) return null
  const visibility = pickOne<RoomVisibility>(value.visibility, ['public', 'private'], 'public')
  const settings: RoomSettings = {
    mode: pickOne<GameMode>(value.mode, MODES, 'time'),
    language: pickOne<GameLanguage>(value.language, LANGUAGES, 'english'),
    duration: intIn(value.duration, 15, 120, 30),
    wordCount: intIn(value.wordCount, 10, 100, 25),
    maxPlayers: intIn(value.maxPlayers, 2, 16, 8),
    minReadyToStart: intIn(value.minReadyToStart, 1, 16, 2),
  }
  settings.minReadyToStart = Math.min(settings.minReadyToStart, settings.maxPlayers)
  const name = sanitizeRoomName(value.name, `${displayName}'s Room`)
  return { displayName, userId, name, visibility, settings }
}

export interface JoinRoomPayload {
  displayName: string
  userId: string | null
  code: string
}

export function sanitizeJoinRoom(value: unknown, displayName: string, userId: string | null): JoinRoomPayload | null {
  if (!isRecord(value)) return null
  const code = sanitizeRoomCode(value.code)
  if (!code) return null
  return { displayName, userId, code }
}

export interface RejoinRoomPayload {
  code: string
  playerId: string
  token: string
}

export function sanitizeRejoinRoom(value: unknown): RejoinRoomPayload | null {
  if (!isRecord(value)) return null
  const code = sanitizeRoomCode(value.code)
  const playerId = sanitizePlayerId(value.playerId)
  const token = sanitizeReconnectToken(value.token)
  if (!code || !playerId || !token) return null
  return { code, playerId, token }
}

/** Coerces a host settings patch (all fields optional, every field clamped). */
export function sanitizeSettingsPatch(value: unknown): Partial<RoomSettings> | null {
  if (!isRecord(value)) return null
  const patch: Partial<RoomSettings> = {}
  if (value.mode !== undefined) patch.mode = pickOne<GameMode>(value.mode, MODES, 'time')
  if (value.language !== undefined) patch.language = pickOne<GameLanguage>(value.language, LANGUAGES, 'english')
  if (value.duration !== undefined) patch.duration = intIn(value.duration, 15, 120, 30)
  if (value.wordCount !== undefined) patch.wordCount = intIn(value.wordCount, 10, 100, 25)
  if (value.maxPlayers !== undefined) patch.maxPlayers = intIn(value.maxPlayers, 2, 16, 8)
  if (value.minReadyToStart !== undefined) patch.minReadyToStart = intIn(value.minReadyToStart, 1, 16, 2)
  return patch
}

/**
 * Strict progress payload parser. Rejects anything that is not a coherent
 * set of non-negative integers; the anti-cheat layer then validates the
 * semantics (monotonicity, rates, skips, finish plausibility).
 */
export function validateProgressInput(value: unknown): ProgressInput | null {
  if (!isRecord(value)) return null
  const wordIndex = value.wordIndex
  const typedCount = value.typedCount
  const correctCount = value.correctCount
  const incorrectCount = value.incorrectCount
  const extraCount = value.extraCount
  const missedCount = value.missedCount
  if (
    !isNonNegInt(wordIndex) ||
    !isNonNegInt(typedCount) ||
    !isNonNegInt(correctCount) ||
    !isNonNegInt(incorrectCount) ||
    !isNonNegInt(extraCount) ||
    !isNonNegInt(missedCount)
  ) {
    return null
  }
  return {
    wordIndex: wordIndex as number,
    typedCount: typedCount as number,
    correctCount: correctCount as number,
    incorrectCount: incorrectCount as number,
    extraCount: extraCount as number,
    missedCount: missedCount as number,
    finished: value.finished === true,
  }
}

function isNonNegInt(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0
}
