import { describe, expect, it } from 'vitest'
import { createHarness, createRoom, joinRoom, progress, type TestHarness } from './helpers.js'

/** Words-mode game: 25 words, min finish time ≈5s, timeout 187.5s. */
function setupRace(h: TestHarness, opts: Record<string, unknown> = {}) {
  const settings = {
    mode: 'time',
    duration: 30,
    wordCount: 25,
    ...opts,
  }
  const { roomId, code, hostId } = createRoom(h, settings)
  const alice = joinRoom(h, code, 'Alice')
  const bob = joinRoom(h, code, 'Bob')
  const room = h.roomOf(hostId)!
  const host = room.players.get(hostId)!
  const aliceP = room.players.get(alice.playerId)!
  const bobP = room.players.get(bob.playerId)!
  for (const p of [host, aliceP, bobP]) h.roomService.setReady(p.id, true)
  h.roomService.startGame(hostId)
  h.clock.advance(3000)
  return { roomId, hostId, alice: alice.playerId, bob: bob.playerId, code }
}

/** A completed race in words mode: everyone reports wordIndex == 25. */
function finishAll(h: TestHarness, roomId: string, hostId: string, alice: string, bob: string, atSec: number) {
  const host = h.roomOf(hostId)!.players.get(hostId)!
  for (const [playerId, extra] of [
    [bob, { at: atSec }],
    [alice, { at: atSec + 1 }],
    [host.id, { at: atSec + 2 }],
  ] as Array<[string, { at: number }]>) {
    h.roomService.handleProgress(
      playerId,
      progress(115, extra.at, { wordIndex: 25, correct: 110, finished: true }),
    )
    h.clock.advance(1)
  }
  void roomId
}

describe('GameService', () => {
  it('broadcasts countdown then a synchronized game:start with identical text', () => {
    const h = harness()
    const { roomId, hostId } = createRoom(h)
    const code = h.roomOf(hostId)!.code
    joinRoom(h, code, 'Alice')
    const room = h.roomOf(hostId)!
    const host = room.players.get(hostId)!
    const alice = [...room.players.values()].find((p) => p.displayName === 'Alice')!
    h.roomService.setReady(host.id, true)
    h.roomService.setReady(alice.id, true)
    h.roomService.startGame(hostId)

    const countdowns = h.eventsFor(roomId, 'game:countdown')
    expect(countdowns).toHaveLength(1)
    expect((countdowns[0] as { endsAt: number }).endsAt).toBe(h.clock.now() + 3000)

    h.clock.advance(2999)
    expect(h.eventsFor(roomId, 'game:start')).toHaveLength(0)
    h.clock.advance(1)
    const starts = h.eventsFor(roomId, 'game:start')
    expect(starts).toHaveLength(1)
    const start = starts[0] as { startAt: number; text: { words: string[] } }
    expect(start.text.words.length).toBeGreaterThan(0)
    expect(start.startAt).toBe(h.clock.now())
  })

  it('prevents double start (host spamming start)', () => {
    const h = harness()
    const { roomId, hostId, code } = createRoom(h)
    joinRoom(h, code, 'Alice')
    const room = h.roomOf(hostId)!
    const host = room.players.get(hostId)!
    const alice = [...room.players.values()].find((p) => p.displayName === 'Alice')!
    h.roomService.setReady(host.id, true)
    h.roomService.setReady(alice.id, true)
    h.roomService.startGame(hostId)
    expect(() => h.roomService.startGame(hostId)).toThrowError(/already/)
    expect(h.eventsFor(roomId, 'game:countdown')).toHaveLength(1)
  })

  it('gives every player the exact same text (words mode)', () => {
    const h = harness()
    const { roomId } = setupRace(h, { mode: 'words' })
    const starts = h.eventsFor(roomId, 'game:start')
    expect(starts).toHaveLength(1)
    const text = (starts[0] as { text: { words: string[]; raw: string; hash: number } }).text
    expect(text.words).toHaveLength(25)
    expect(text.hash).toBeGreaterThan(0)
  })

  it('ignores progress before the game starts (countdown phase)', () => {
    const h = harness()
    const { roomId, hostId, code } = createRoom(h)
    const { playerId: alice } = joinRoom(h, code, 'Alice')
    const room = h.roomOf(hostId)!
    const host = room.players.get(hostId)!
    h.roomService.setReady(host.id, true)
    h.roomService.setReady(alice, true)
    h.roomService.startGame(hostId)
    h.roomService.handleProgress(alice, progress(10, 2))
    h.clock.advance(3000)
    expect(h.eventsFor(roomId, 'game:progress')).toHaveLength(0)
  })

  it('computes WPM, accuracy and progress server-side only', () => {
    const h = harness()
    const { roomId, hostId, alice } = setupRace(h)
    h.clock.advance(10_000)
    h.roomService.handleProgress(alice, progress(50, 10, { wordIndex: 10, correct: 48, incorrect: 2 }))
    const updates = h.eventsFor(roomId, 'game:progress')
    expect(updates).toHaveLength(1)
    const u = updates[0] as {
      playerId: string
      wpm: number
      rawWpm: number
      accuracy: number
      progressPct: number
    }
    expect(u.playerId).toBe(alice)
    // 48 correct chars in 10s → net WPM ≈ (48/5)/(10/60) ≈ 58
    expect(u.wpm).toBeGreaterThan(50)
    expect(u.wpm).toBeLessThan(65)
    expect(u.accuracy).toBe(96)
    // 30s time mode → 210 words; 10/210 → 5%
    expect(u.progressPct).toBe(5)
    void hostId
  })

  it('broadcasts the leaderboard immediately when a player finishes', () => {
    const h = harness()
    const { roomId, alice } = setupRace(h, { mode: 'words' })
    h.clock.advance(45_000)
    h.roomService.handleProgress(alice, progress(115, 45, { wordIndex: 25, correct: 110, finished: true }))
    const leaderboards = h.eventsFor(roomId, 'game:leaderboard')
    expect(leaderboards).toHaveLength(1)
    expect((leaderboards[0] as unknown[])).toHaveLength(3)
    void roomId
  })

  it('ignores duplicate finish events and later progress after finish', () => {
    const h = harness()
    const { roomId, alice } = setupRace(h, { mode: 'words' })
    h.clock.advance(45_000)
    h.roomService.handleProgress(alice, progress(115, 45, { wordIndex: 25, correct: 110, finished: true }))
    h.clock.advance(1_000)
    h.roomService.handleProgress(alice, progress(116, 46, { wordIndex: 25, correct: 111, finished: true }))
    expect(h.eventsFor(roomId, 'game:leaderboard')).toHaveLength(1)
    void roomId
  })

  it('ends the game when everyone finishes and ranks by finish time', () => {
    const h = harness()
    const { roomId, hostId, alice, bob } = setupRace(h, { mode: 'words' })
    h.clock.advance(45_000)
    finishAll(h, roomId, hostId, alice, bob, 45)
    const ended = h.eventsFor(roomId, 'game:ended')
    expect(ended).toHaveLength(1)
    const entries = ended[0] as Array<{ rank: number; playerId: string; finishTimeMs: number }>
    expect(entries).toHaveLength(3)
    expect(entries[0]?.playerId).toBe(bob)
    expect(entries[1]?.playerId).toBe(alice)
    expect(entries[2]?.playerId).toBe(hostId)
    expect(entries.map((e) => e.rank)).toEqual([1, 2, 3])
  })

  it('ends the game when the timer expires (time mode)', () => {
    const h = harness()
    const { roomId } = setupRace(h)
    h.clock.advance(30_000)
    const ended = h.eventsFor(roomId, 'game:ended')
    expect(ended).toHaveLength(1)
    expect(ended[0] as unknown[]).toHaveLength(3)
    void roomId
  })

  it('ranks unfinished players by progress after the timer expires', () => {
    const h = harness()
    const { roomId, hostId, alice, bob } = setupRace(h)
    h.clock.advance(20_000)
    h.roomService.handleProgress(alice, progress(60, 20, { wordIndex: 12, correct: 58 }))
    h.roomService.handleProgress(bob, progress(40, 20, { wordIndex: 8, correct: 38 }))
    h.clock.advance(10_000)
    const ended = h.eventsFor(roomId, 'game:ended')[0] as Array<{ playerId: string; rank: number }>
    const aliceRank = ended.find((e) => e.playerId === alice)?.rank ?? 99
    const bobRank = ended.find((e) => e.playerId === bob)?.rank ?? 99
    expect(aliceRank).toBeLessThan(bobRank)
    void hostId
  })

  it('host can play again → room resets to waiting with ready=false', () => {
    const h = harness()
    const { roomId, hostId } = setupRace(h)
    h.clock.advance(30_000) // game ends
    h.roomService.playAgain(hostId)
    const room = h.roomOf(hostId)!
    expect(room.phase).toBe('waiting')
    for (const p of room.players.values()) expect(p.ready).toBe(false)
    expect(room.players.get(hostId)?.wordIndex).toBe(0)
    void roomId
  })

  it('only the host can play again', () => {
    const h = harness()
    const { hostId, alice } = setupRace(h)
    h.clock.advance(30_000)
    expect(() => h.roomService.playAgain(alice)).toThrowError('host')
    void hostId
  })

  it('endGame is idempotent (all-finished and expiry can overlap)', () => {
    const h = harness()
    const { roomId, hostId, alice, bob } = setupRace(h, { mode: 'words' })
    // Everyone finishes just before the 187.5s words-mode timeout.
    h.clock.advance(187_499)
    finishAll(h, roomId, hostId, alice, bob, 187.4)
    h.clock.advance(1)
    const ended = h.eventsFor(roomId, 'game:ended')
    expect(ended).toHaveLength(1)
  })

  it('does not start with a single player', () => {
    const h = harness()
    const { hostId } = createRoom(h)
    h.roomService.setReady(hostId, true)
    expect(() => h.roomService.startGame(hostId)).toThrowError(/2 players/)
  })
})

function harness(): TestHarness {
  return createHarness()
}
