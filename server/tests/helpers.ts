import { Logger } from '../src/logger.js'
import type { BroadcastBus, InternalRoom } from '../src/services/roomService.js'
import { RoomService } from '../src/services/roomService.js'
import { GameService } from '../src/services/gameService.js'
import { TextService } from '../src/services/textService.js'

export interface CapturedEvent {
  roomId: string
  event: string
  payload: unknown
  playerId?: string
}

export interface TestHarness {
  roomService: RoomService
  gameService: GameService
  events: CapturedEvent[]
  clock: { now(): number; advance(ms: number): void }
  bus: BroadcastBus
  roomOf(playerId: string): InternalRoom | null
  eventsFor(roomId: string, event: string): unknown[]
}

/**
 * Test harness with a deterministic clock, manual timers and an event-capturing
 * broadcast bus. No real sockets or wall-clock sleeps — tests are fast and
 * race-free.
 */
export function createHarness(opts: { graceMs?: number; rng?: () => number } = {}): TestHarness {
  const events: CapturedEvent[] = []
  const bus: BroadcastBus = {
    toRoom: (roomId, event, payload) => events.push({ roomId, event, payload }),
    toPlayer: (roomId, playerId, event, payload) => events.push({ roomId, event, payload, playerId }),
    toPlayerSockets: (roomId, playerId, event, payload) => events.push({ roomId, event, payload, playerId }),
    disconnectPlayerSockets: () => {},
  }

  let now = 1_000_000
  let nextTimerId = 1
  const timers = new Map<number, { fn: () => void; at: number }>()

  const clock = {
    now: () => now,
    advance(ms: number) {
      now += ms
      fireDue()
    },
  }
  function fireDue(): void {
    for (const [id, timer] of [...timers]) {
      if (timer.at <= now) {
        timers.delete(id)
        timer.fn()
      }
    }
  }
  const setTimeoutFn = (fn: () => void, ms: number): NodeJS.Timeout => {
    const id = nextTimerId++
    timers.set(id, { fn, at: now + ms })
    return id as unknown as NodeJS.Timeout
  }
  const clearTimeoutFn = (t: NodeJS.Timeout): void => {
    timers.delete(Number(t))
  }

  const logger = new Logger('error')
  const textService = new TextService({ random: opts.rng ?? (() => 0.5) })
  const gameService = new GameService({ textService, logger, now: clock.now, setTimeoutFn, clearTimeoutFn })
  const roomService = new RoomService({
    bus,
    gameService,
    logger,
    now: clock.now,
    setTimeoutFn,
    clearTimeoutFn,
    rng: opts.rng ?? (() => 0.5),
    disconnectGraceMs: opts.graceMs ?? 30_000,
  })

  return {
    roomService,
    gameService,
    events,
    clock,
    bus,
    roomOf: (playerId) => roomService._resolvePlayer(playerId).room,
    eventsFor: (roomId, event) =>
      events.filter((e) => e.roomId === roomId && e.event === event).map((e) => e.payload),
  }
}

/** Convenience: create a room with the given host and return its code + host id. */
export function createRoom(harness: TestHarness, overrides: Record<string, unknown> = {}) {
  const { name, visibility, ...settingsOverrides } = overrides
  const { room, playerId } = harness.roomService.createRoom({
    displayName: 'Host',
    userId: null,
    name: (name as string | undefined) ?? 'Test Room',
    visibility: (visibility as 'public' | 'private' | undefined) ?? 'public',
    settings: {
      mode: 'time',
      duration: 30,
      wordCount: 25,
      language: 'english',
      maxPlayers: 8,
      minReadyToStart: 2,
      ...settingsOverrides,
    },
  })
  return { room, hostId: playerId, code: room.code, roomId: room.id }
}

/** Add a player to a room; returns playerId. */
export function joinRoom(harness: TestHarness, code: string, name = 'Player') {
  const { room, playerId } = harness.roomService.joinRoom(name, null, code)
  return { room, playerId, name }
}

/** Runs a full countdown and returns the game text that was broadcast. */
export function startGame(harness: TestHarness, roomId: string, hostId: string) {
  harness.roomService.startGame(hostId)
  harness.clock.advance(3000)
  const payloads = harness.eventsFor(roomId, 'game:start')
  return payloads[0] as { startAt: number; text: { words: string[]; hash: number }; settings: { mode: string } }
}

/** Realistic progress report for `typed` chars over `elapsedSec` seconds. */
export function progress(typed: number, elapsedSec: number, extra: Partial<{ wordIndex: number; correct: number; incorrect: number; missed: number; finished: boolean }> = {}) {
  const words = extra.wordIndex ?? Math.floor(typed / 5)
  const correct = extra.correct ?? Math.floor(typed * 0.95)
  const incorrect = extra.incorrect ?? Math.max(0, typed - correct)
  return {
    wordIndex: words,
    typedCount: typed,
    correctCount: correct,
    incorrectCount: incorrect,
    extraCount: Math.max(0, typed - correct - incorrect),
    missedCount: extra.missed ?? 0,
    finished: extra.finished ?? false,
  }
}
