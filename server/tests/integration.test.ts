import { afterEach, describe, expect, it } from 'vitest'
import { io as createClient } from 'socket.io-client'
import { createServer } from '../src/index.js'
import type { RoomSnapshot } from '../../shared/types.js'
import { ClientEvents, ServerEvents } from '../../shared/types.js'

interface TestClient {
  socket: Socket
  name: string
  roomId: string | null
  playerId: string | null
  reconnectToken: string | null
  lastSnapshot: RoomSnapshot | null
  progress: unknown[]
  leaderboard: unknown[]
  ended: unknown[]
  errors: Array<{ code: string; message: string }>
  next<T>(event: string): Promise<T>
}

const cleanupFns = new Set<() => void>()

function connect(port: number, name: string): TestClient {
  const socket = createClient(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    auth: { name },
  })
  const client: TestClient = {
    socket,
    name,
    roomId: null,
    playerId: null,
    reconnectToken: null,
    lastSnapshot: null,
    progress: [],
    leaderboard: [],
    ended: [],
    errors: [],
    next: (event) =>
      new Promise((resolve) => {
        const handler = (payload: unknown) => {
          socket.off(event, handler)
          cleanupFns.delete(cleanup)
          resolve(payload as T)
        }
        const cleanup = () => socket.off(event, handler)
        socket.on(event, handler)
        cleanupFns.add(cleanup)
      }),
  }
  const onSnapshot = (payload: unknown) => {
    const { snapshot, self } = payload as {
      snapshot: RoomSnapshot
      self: { playerId: string; reconnectToken: string | null }
    }
    client.lastSnapshot = snapshot
    client.roomId = snapshot.id
    client.playerId = self.playerId
    client.reconnectToken = self.reconnectToken
  }
  const onRoomState = (payload: unknown) => {
    client.lastSnapshot = payload as RoomSnapshot
  }
  const onProgress = (payload: unknown) => client.progress.push(payload)
  const onLeaderboard = (payload: unknown) => client.leaderboard.push(payload)
  const onEnded = (payload: unknown) => client.ended.push(payload)
  const onError = (payload: unknown) => {
    client.errors.push(payload as { code: string; message: string })
  }
  socket.on(ServerEvents.ROOM_SNAPSHOT, onSnapshot)
  socket.on(ServerEvents.ROOM_STATE, onRoomState)
  socket.on(ServerEvents.PROGRESS, onProgress)
  socket.on(ServerEvents.LEADERBOARD, onLeaderboard)
  socket.on(ServerEvents.GAME_ENDED, onEnded)
  socket.on(ServerEvents.ERROR, onError)
  cleanupFns.add(() => {
    socket.off(ServerEvents.ROOM_SNAPSHOT, onSnapshot)
    socket.off(ServerEvents.ROOM_STATE, onRoomState)
    socket.off(ServerEvents.PROGRESS, onProgress)
    socket.off(ServerEvents.LEADERBOARD, onLeaderboard)
    socket.off(ServerEvents.GAME_ENDED, onEnded)
    socket.off(ServerEvents.ERROR, onError)
  })
  return client
}

async function waitConnect(client: TestClient): Promise<void> {
  if (client.socket.connected) return
  await new Promise<void>((resolve, reject) => {
    const fail = (err: Error) => {
      client.socket.off('connect', ok)
      client.socket.off('connect_error', fail)
      reject(err)
    }
    const ok = () => {
      client.socket.off('connect', ok)
      client.socket.off('connect_error', fail)
      resolve()
    }
    client.socket.on('connect', ok)
    client.socket.on('connect_error', fail)
  })
}

/** Emits an event with an ack; rejects if the server acked false. */
function emitAck(client: TestClient, event: string, payload?: unknown): Promise<boolean> {
  return new Promise((resolve, reject) => {
    client.socket.emit(event, payload, (ok: unknown) => {
      if (ok === true) resolve(true)
      else reject(new Error(`${event} was not acknowledged (got ${String(ok)})`))
    })
  })
}

async function waitFor<T>(fn: () => T | undefined, timeoutMs = 5_000): Promise<T> {
  const start = Date.now()
  for (;;) {
    const value = fn()
    if (value !== undefined) return value
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition')
    await new Promise((r) => setTimeout(r, 25))
  }
}

let server: ReturnType<typeof createServer> | null = null
let port = 0
const clients: TestClient[] = []

async function startServer(): Promise<void> {
  if (server) return
  server = createServer({
    port: 0,
    corsOrigins: ['http://localhost:5173'],
    logLevel: 'error',
    disconnectGraceMs: 30_000,
    shutdownGraceMs: 2_000,
  })
  await server.start(0)
  port = (server.httpServer.address() as { port: number }).port
}

afterEach(() => {
  for (const c of clients.splice(0)) c.socket.disconnect()
  for (const fn of cleanupFns) fn()
  cleanupFns.clear()
})

describe('socket integration', () => {
  it('creates a room, joins, races and receives a ranked leaderboard', async () => {
    await startServer()
    const host = connect(port, 'Host')
    const alice = connect(port, 'Alice')
    const bob = connect(port, 'Bob')
    clients.push(host, alice, bob)
    await Promise.all([waitConnect(host), waitConnect(alice), waitConnect(bob)])

    await emitAck(host, ClientEvents.CREATE_ROOM, {
      name: 'Race Room',
      visibility: 'public',
      mode: 'words',
      duration: 15,
      wordCount: 10,
    })
    expect(host.roomId).toBeTruthy()
    expect(host.reconnectToken).toBeTruthy()
    const code = host.lastSnapshot!.code

    await emitAck(alice, ClientEvents.JOIN_ROOM, { code })
    await emitAck(bob, ClientEvents.JOIN_ROOM, { code })
    expect(alice.roomId).toBe(host.roomId)
    expect(bob.roomId).toBe(host.roomId)

    for (const client of [host, alice, bob]) client.socket.emit(ClientEvents.SET_READY, true)
    // Wait until every player's ready state is confirmed via ROOM_STATE
    // broadcasts before starting — otherwise START_GAME can race the packets.
    await waitFor(() => {
      const s = host.lastSnapshot
      return s && s.players.length === 3 && s.players.every((p) => p.ready) ? s : undefined
    })
    const cdPromise = alice.next<{ endsAt: number }>(ServerEvents.COUNTDOWN)
    host.socket.emit(ClientEvents.START_GAME)
    const cd = await cdPromise
    expect(cd.endsAt).toBeGreaterThan(Date.now())

    const starts = await Promise.all(
      [host, alice, bob].map((c) =>
        c.next<{ text: { words: string[]; hash: number }; startAt: number }>(ServerEvents.GAME_START),
      ),
    )
    expect(new Set(starts.map((s) => s.text.hash)).size).toBe(1)
    expect(starts[0]!.text.words).toHaveLength(10)
    const startAt = Math.min(...starts.map((s) => s.startAt))
    void startAt

    alice.socket.emit(ClientEvents.PROGRESS, {
      wordIndex: 4,
      typedCount: 20,
      correctCount: 19,
      incorrectCount: 1,
      extraCount: 0,
      missedCount: 0,
      finished: false,
    })
    const progressEvent = await waitFor(() =>
      host.progress.find((p) => (p as { playerId: string }).playerId === alice.playerId),
    )
    expect((progressEvent as { wpm: number }).wpm).toBeGreaterThan(0)
    expect((progressEvent as { progressPct: number }).progressPct).toBe(40)

    alice.socket.emit(ClientEvents.PROGRESS, {
      wordIndex: 10,
      typedCount: 55,
      correctCount: 52,
      incorrectCount: 3,
      extraCount: 0,
      missedCount: 0,
      finished: true,
    })
    await waitFor(() => host.leaderboard[0])

    bob.socket.emit(ClientEvents.PROGRESS, {
      wordIndex: 10,
      typedCount: 56,
      correctCount: 54,
      incorrectCount: 2,
      extraCount: 0,
      missedCount: 0,
      finished: true,
    })
    // Bob's finish goes over his own socket; wait for it to be ranked as
    // finished before the host finishes, so the rank order is deterministic.
    await waitFor(() =>
      (host.leaderboard[host.leaderboard.length - 1] as Array<{ playerId: string; finished: boolean }>).some(
        (e) => e.playerId === bob.playerId && e.finished,
      ),
    )
    host.socket.emit(ClientEvents.PROGRESS, {
      wordIndex: 10,
      typedCount: 60,
      correctCount: 58,
      incorrectCount: 2,
      extraCount: 0,
      missedCount: 0,
      finished: true,
    })
    const ended = (await waitFor(() => host.ended[0])) as Array<{ playerId: string; rank: number }>
    expect(ended).toHaveLength(3)
    expect(ended.find((e) => e.playerId === alice.playerId)?.rank).toBe(1)
    expect(ended.find((e) => e.playerId === bob.playerId)?.rank).toBe(2)
  })

  it('rejects a join with a bad payload and reports a typed error', async () => {
    await startServer()
    const client = connect(port, 'X')
    clients.push(client)
    await waitConnect(client)
    client.socket.emit(ClientEvents.JOIN_ROOM, { code: '!!!' })
    const error = await client.next<{ code: string }>(ServerEvents.ERROR)
    expect(error.code).toBe('INVALID_ARGUMENT')
  })

  it('rejoins with a reconnect token after a socket drop', async () => {
    await startServer()
    const host = connect(port, 'Host')
    const alice = connect(port, 'Alice')
    clients.push(host, alice)
    await Promise.all([waitConnect(host), waitConnect(alice)])

    await emitAck(host, ClientEvents.CREATE_ROOM, {
      name: 'R2',
      visibility: 'public',
      mode: 'time',
      duration: 15,
    })
    const code = host.lastSnapshot!.code
    await emitAck(alice, ClientEvents.JOIN_ROOM, { code })
    expect(alice.playerId).toBeTruthy()
    expect(alice.reconnectToken).toBeTruthy()

    alice.socket.disconnect()
    await new Promise((r) => setTimeout(r, 100))

    const reconnected = connect(port, 'Alice')
    clients.push(reconnected)
    await waitConnect(reconnected)
    await emitAck(reconnected, ClientEvents.REJOIN_ROOM, {
      code,
      playerId: alice.playerId,
      token: alice.reconnectToken,
    })
    expect(reconnected.roomId).toBe(host.roomId)
    expect(reconnected.playerId).toBe(alice.playerId)
  })

  it('lists public rooms via ack and excludes private ones', async () => {
    await startServer()
    const a = connect(port, 'A')
    const b = connect(port, 'B')
    clients.push(a, b)
    await Promise.all([waitConnect(a), waitConnect(b)])

    await emitAck(a, ClientEvents.CREATE_ROOM, { name: 'Public Room', visibility: 'public', mode: 'time' })
    await emitAck(b, ClientEvents.CREATE_ROOM, { name: 'Secret Room', visibility: 'private', mode: 'time' })

    const rooms = await new Promise<Array<{ name: string }>>((resolve) => {
      // NOTE: an empty payload {} is required — socket.io-client 4.8 sends a
      // trailing callback as *data* when it is the only argument.
      a.socket.emit(ClientEvents.REQUEST_ROOMS, {}, (list: unknown) => resolve(list as Array<{ name: string }>))
    })
    const names = rooms.map((r) => r.name)
    expect(names).toContain('Public Room')
    expect(names).not.toContain('Secret Room')
  })
})
