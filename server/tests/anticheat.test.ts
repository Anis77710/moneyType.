import { describe, expect, it } from 'vitest'
import { Anticheat } from '../src/security/anticheat.js'
import { Logger } from '../src/logger.js'
import type { InternalRoom } from '../src/services/roomService.js'
import type { PlayerState, RoomSettings } from '../../shared/types.js'
import type { ProgressInput } from '../src/validation/schema.js'

const WORDS = ['hello', 'world', 'typing', 'race', 'zen']
// totalChars = 5+5+6+4+3 + 4 spaces = 27 → minFinishSec ≈ 0.9
const SETTINGS: RoomSettings = {
  mode: 'words',
  duration: 30,
  wordCount: 5,
  language: 'english',
  maxPlayers: 8,
  minReadyToStart: 2,
}

function makePlayer(): PlayerState {
  return {
    id: 'p1',
    userId: null,
    displayName: 'Player',
    avatarColor: '#ff6b6b',
    ready: false,
    connected: true,
    isHost: false,
    lastSeenAt: 0,
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

function makeRoom(words: string[] = WORDS): InternalRoom {
  return {
    id: 'r1',
    code: 'ABC123',
    name: 'Room',
    hostId: 'p1',
    visibility: 'public',
    phase: 'running',
    settings: SETTINGS,
    createdAt: 0,
    players: new Map(),
    playerByUserId: new Map(),
    socketBindings: new Map(),
    reconnectTokens: new Map(),
    disconnectTimers: new Map(),
    game: {
      phase: 'running',
      startedAt: 0,
      endsAt: 99_999,
      text: { words, raw: words.join(' '), hash: 1, mode: 'words' },
      timer: null,
      ended: false,
    },
    wpmSamples: new Map(),
  } as unknown as InternalRoom
}

function input(partial: Partial<ProgressInput> = {}): ProgressInput {
  return {
    wordIndex: 5,
    typedCount: 25,
    correctCount: 23,
    incorrectCount: 2,
    extraCount: 0,
    missedCount: 0,
    finished: false,
    ...partial,
  }
}

/** Applies an accepted/clamped verdict to the fake player (mirrors applyProgress). */
function apply(h: { anticheat: Anticheat; player: PlayerState; room: InternalRoom }, raw: ProgressInput, elapsedMs: number, nowMs: number): ReturnType<Anticheat['verify']> {
  const verdict = h.anticheat.verify(h.room, h.player, raw, elapsedMs, nowMs, WORDS.length)
  if (verdict.accepted || verdict.clamped) {
    const v = verdict.clamped ?? raw
    h.player.wordIndex = v.wordIndex
    h.player.typedCount = v.typedCount
    h.player.correctCount = v.correctCount
    h.player.incorrectCount = v.incorrectCount
    h.player.extraCount = v.extraCount
    h.player.missedCount = v.missedCount
  }
  return verdict
}

describe('Anticheat', () => {
  it('accepts a normal honest event', () => {
    const anticheat = new Anticheat({ logger: new Logger('error'), now: () => 10_000 })
    const player = makePlayer()
    const verdict = apply({ anticheat, player, room: makeRoom() }, input(), 10_000, 10_000)
    expect(verdict.accepted).toBe(true)
  })

  it('rate-limits progress floods (>8 events/sec per player)', () => {
    const anticheat = new Anticheat({ logger: new Logger('error'), now: () => 10_000 })
    const player = makePlayer()
    const ctx = { anticheat, player, room: makeRoom() }
    expect(apply(ctx, input(), 10_000, 10_000).accepted).toBe(true)
    const verdict = apply(ctx, input({ typedCount: 26, correctCount: 24 }), 10_100, 10_100)
    expect(verdict.accepted).toBe(false)
    expect(verdict.reason).toBe('rate_limited')
  })

  it('rejects regressions (counters going backwards)', () => {
    const anticheat = new Anticheat({ logger: new Logger('error'), now: () => 10_000 })
    const player = makePlayer()
    const ctx = { anticheat, player, room: makeRoom() }
    expect(apply(ctx, input(), 10_000, 10_000).accepted).toBe(true)
    const verdict = apply(ctx, input({ typedCount: 20 }), 11_000, 11_000)
    expect(verdict.accepted).toBe(false)
    expect(verdict.reason).toBe('regression')
  })

  it('rejects word indexes beyond the text length', () => {
    const anticheat = new Anticheat({ logger: new Logger('error'), now: () => 10_000 })
    const verdict = anticheat.verify(makeRoom(), makePlayer(), input({ wordIndex: 6 }), 10_000, 10_000, WORDS.length)
    expect(verdict.accepted).toBe(false)
    expect(verdict.reason).toBe('word_index_out_of_bounds')
  })

  it('rejects incoherent counters (parts > whole)', () => {
    const anticheat = new Anticheat({ logger: new Logger('error'), now: () => 10_000 })
    const verdict = anticheat.verify(makeRoom(), makePlayer(), input({ correctCount: 26 }), 10_000, 10_000, WORDS.length)
    expect(verdict.accepted).toBe(false)
    expect(verdict.reason).toBe('counter_incoherence')
  })

  it('clamps impossible typing rates to the physical maximum', () => {
    const anticheat = new Anticheat({ logger: new Logger('error'), now: () => 10_000 })
    const verdict = anticheat.verify(
      makeRoom(),
      makePlayer(),
      input({ typedCount: 500, correctCount: 400, incorrectCount: 100 }),
      10_000,
      10_000,
      WORDS.length,
    )
    expect(verdict.accepted).toBe(false)
    expect(verdict.reason).toBe('impossible_typing_rate')
    // maxTyped = 10s * 30 chars/s + 4 = 304
    expect(verdict.clamped?.typedCount).toBe(304)
    expect(verdict.clamped?.correctCount).toBe(304)
  })

  it('clamps word jumps that skip too many words', () => {
    const anticheat = new Anticheat({ logger: new Logger('error'), now: () => 10_000 })
    const player = makePlayer()
    const room = makeRoom(Array.from({ length: 20 }, (_, i) => `word${i}`))
    // First event ever: 12 chars typed but claims word 14 → 14 > 12+1 words.
    const verdict = anticheat.verify(
      room,
      player,
      input({ wordIndex: 14, typedCount: 12, correctCount: 10, incorrectCount: 2 }),
      10_000,
      10_000,
      20,
    )
    expect(verdict.accepted).toBe(false)
    expect(verdict.reason).toBe('skipped_words')
    expect(verdict.clamped?.wordIndex).toBe(13) // 0 + (12-0) + 1
  })

  it('rejects finishing before the last word (early finish)', () => {
    const anticheat = new Anticheat({ logger: new Logger('error'), now: () => 10_000 })
    const verdict = anticheat.verify(makeRoom(), makePlayer(), input({ wordIndex: 4, finished: true }), 10_000, 10_000, WORDS.length)
    expect(verdict.accepted).toBe(false)
    expect(verdict.reason).toBe('early_finish')
    expect(verdict.clamped?.finished).toBe(false)
  })

  it('rejects finishing faster than physically possible', () => {
    const anticheat = new Anticheat({ logger: new Logger('error'), now: () => 10_000 })
    // 27 chars at 30 chars/s needs ≥ 0.9s; 0.5s is impossible.
    // (typedCount 15 stays under the 19-char rate cap for 0.5s.)
    const verdict = anticheat.verify(
      makeRoom(),
      makePlayer(),
      input({ wordIndex: 5, typedCount: 15, correctCount: 13, finished: true }),
      500,
      10_000,
      WORDS.length,
    )
    expect(verdict.accepted).toBe(false)
    expect(verdict.reason).toBe('impossible_finish_time')
    expect(verdict.clamped?.finished).toBe(false)
  })

  it('accepts a legitimate finish at the last word after enough time', () => {
    const anticheat = new Anticheat({ logger: new Logger('error'), now: () => 10_000 })
    const verdict = anticheat.verify(makeRoom(), makePlayer(), input({ wordIndex: 5, finished: true }), 10_000, 10_000, WORDS.length)
    expect(verdict.accepted).toBe(true)
  })
})
