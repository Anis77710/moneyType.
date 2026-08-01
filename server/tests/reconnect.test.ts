import { describe, expect, it } from 'vitest'
import { createHarness, createRoom, joinRoom } from './helpers.js'
import { RoomError } from '../src/services/roomService.js'

describe('rejoin / session restore', () => {
  it('rejects an unknown room', () => {
    const h = createHarness()
    expect(() => h.roomService.rejoinPlayer('ZZZZZZ', 'player', 'token')).toThrowError(RoomError)
    try {
      h.roomService.rejoinPlayer('ZZZZZZ', 'player', 'token')
    } catch (err) {
      expect((err as RoomError).code).toBe('NOT_FOUND')
    }
  })

  it('rejects an unknown playerId in a known room', () => {
    const h = createHarness()
    const { code } = createRoom(h)
    expect(() =>
      h.roomService.rejoinPlayer(code, '00000000-0000-4000-8000-000000000000', 'a'.repeat(48)),
    ).toThrowError('not found')
  })

  it('rejects a wrong reconnect token (session hijacking)', () => {
    const h = createHarness()
    const { code } = createRoom(h)
    const { playerId } = joinRoom(h, code, 'Alice')
    expect(() => h.roomService.rejoinPlayer(code, playerId, 'f'.repeat(48))).toThrowError('rejected')
    try {
      h.roomService.rejoinPlayer(code, playerId, 'f'.repeat(48))
    } catch (err) {
      expect((err as RoomError).code).toBe('INVALID_TOKEN')
    }
  })

  it('restores a disconnected player and their game state', () => {
    const h = createHarness()
    const { code, roomId, hostId } = createRoom(h)
    const { playerId: alice } = joinRoom(h, code, 'Alice')
    const room = h.roomOf(hostId)!

    h.roomService.bindSocket(roomId, alice, 'socket-alice')
    h.roomService.handleDisconnect('socket-alice', 'transport close')
    expect(room.players.get(alice)?.connected).toBe(false)

    const token = room.reconnectTokens.get(alice)!
    const outcome = h.roomService.rejoinPlayer(code, alice, token)
    expect(outcome.playerId).toBe(alice)
    expect(room.players.get(alice)?.connected).toBe(true)

    // Snapshot still contains the restored player.
    const snapshot = h.roomService.getSnapshot(roomId)!
    expect(snapshot.players.map((p) => p.id)).toContain(alice)
  })

  it('clears the removal timer when the player returns', () => {
    const h = createHarness({ graceMs: 10_000 })
    const { code, roomId } = createRoom(h)
    const { playerId: alice } = joinRoom(h, code, 'Alice')
    h.roomService.bindSocket(roomId, alice, 'socket-a')
    h.roomService.handleDisconnect('socket-a', 'transport close')
    h.clock.advance(9_000)
    h.roomService.rejoinPlayer(code, alice, h.roomOf(alice)!.reconnectTokens.get(alice)!)
    h.clock.advance(10_000)
    expect(h.roomOf(alice)!.players.has(alice)).toBe(true)
  })
})
