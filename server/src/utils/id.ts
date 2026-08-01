import { randomBytes, randomUUID } from 'node:crypto'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/**
 * Generates a short, human-friendly room code avoiding ambiguous characters.
 * Collision-safe: callers must verify uniqueness against existing rooms.
 */
export function generateRoomCode(length: number): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }
  return code
}

export function generatePlayerId(): string {
  return randomUUID()
}

/** Opaque token used to prove ownership of a player session during reconnects. */
export function generateReconnectToken(): string {
  return randomBytes(24).toString('hex')
}

/** djb2 string hash — used for text integrity checks and deterministic colors. */
export function hashString(input: string): number {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0
  }
  return hash >>> 0
}

/** Deterministic avatar color from a stable seed (player name + id). */
export function pickAvatarColor(seed: string, palette: readonly string[]): string {
  const hash = hashString(seed)
  return palette[hash % palette.length] ?? palette[0] ?? '#888888'
}

export function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) throw new Error('maxExclusive must be positive')
  const limit = Math.floor(maxExclusive)
  const range = 256 - (256 % limit)
  const bytes = randomBytes(1)
  let value = bytes[0] ?? 0
  while (value >= range) {
    value = randomBytes(1)[0] ?? 0
  }
  return value % limit
}
