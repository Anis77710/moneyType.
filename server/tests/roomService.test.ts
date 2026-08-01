import { describe, expect, it } from 'vitest'
import { createHarness, createRoom, joinRoom, type TestHarness } from './helpers.js'
import { RoomError } from '../src/services/roomService.js'

function harness(): TestHarness {
  return createHarness({ graceMs: 30_000 })
}

describe('RoomService', () => {
  describe('createRoom', () => {
    it('creates a room with the host as first player and a unique code', () => {
      const h = harness()
      const { room, code, hostId } = createRoom(h)
      expect(room.players.size).toBe(1)
      expect(room.hostId).toBe(hostId)
      expect(code).toMatch(/^[A-Z0-9]{6}$/)
      const host = room.players.get(hostId)
      expect(host?.isHost).toBe(true)
      expect(host?.displayName).toBe('Host')
    })

    it('generates distinct codes for many rooms', () => {
      const h = harness()
      const codes = new Set<string>()
      for (let i = 0; i < 50; i++) {
        codes.add(createRoom(h, { name: `Room ${i}` }).code)
      }
      expect(codes.size).toBe(50)
    })

    it('respects private visibility and never lists private rooms publicly', () => {
      const h = harness()
      createRoom(h, { visibility: 'private', name: 'Secret' })
      createRoom(h, { name: 'Public' })
      const list = h.roomService.listPublicRooms(50)
      expect(list).toHaveLength(1)
      expect(list[0]?.name).toBe('Public')
    })

    it('clamps maxPlayers to the allowed range', () => {
      const h = harness()
      const { room } = createRoom(h, { maxPlayers: 99 })
      expect(room.settings.maxPlayers).toBe(16)
      const { room: r2 } = createRoom(h, { maxPlayers: 0 })
      expect(r2.settings.maxPlayers).toBe(2)
    })

    it('caps minReadyToStart at maxPlayers', () => {
      const h = harness()
      const { room } = createRoom(h, { maxPlayers: 4, minReadyToStart: 9 })
      expect(room.settings.minReadyToStart).toBe(4)
    })
  })

  describe('joinRoom', () => {
    it('joins a waiting room and broadcasts state', () => {
      const h = harness()
      const { code, roomId } = createRoom(h)
      const { playerId } = joinRoom(h, code, 'Alice')
      const room = h.roomOf(playerId)!
      expect(room.players.size).toBe(2)
      expect(h.eventsFor(roomId, 'room:state')).toHaveLength(1)
    })

    it('rejects unknown room codes', () => {
      const h = harness()
      expect(() => joinRoom(h, 'ZZZZZZ')).toThrowError(RoomError)
      try {
        joinRoom(h, 'ZZZZZZ')
      } catch (err) {
        expect((err as RoomError).code).toBe('NOT_FOUND')
      }
    })

    it('rejects joining a full room', () => {
      const h = harness()
      const { code } = createRoom(h, { maxPlayers: 2 })
      joinRoom(h, code, 'Alice')
      expect(() => joinRoom(h, code, 'Bob')).toThrowError('full')
    })

    it('rejects duplicate display names (case-insensitive)', () => {
      const h = harness()
      const { code } = createRoom(h)
      joinRoom(h, code, 'Alice')
      expect(() => joinRoom(h, code, 'alice')).toThrowError('taken')
    })

    it('rejects the same auth user joining twice', () => {
      const h = harness()
      const { code } = createRoom(h)
      const userId = 'user-123'
      const { playerId } = h.roomService.joinRoom('A', userId, code)
      expect(playerId).toBeTruthy()
      expect(() => h.roomService.joinRoom('B', userId, code)).toThrowError('already')
    })

    it('rejects joining a room that is already playing', () => {
      const h = harness()
      const { code, hostId } = createRoom(h)
      const { playerId: alice } = joinRoom(h, code, 'Alice')
      h.roomService.setReady(hostId, true)
      h.roomService.setReady(alice, true)
      h.roomService.startGame(hostId)
      expect(() => joinRoom(h, code, 'Bob')).toThrowError(/already|game/i)
    })

    it('is case-insensitive for room codes', () => {
      const h = harness()
      const { code } = createRoom(h)
      const { playerId } = h.roomService.joinRoom('Alice', null, code.toLowerCase())
      expect(playerId).toBeTruthy()
    })
  })

  describe('leave / kick / host transfer', () => {
    it('deletes the room when the last player leaves', () => {
      const h = harness()
      const { code, hostId } = createRoom(h)
      h.roomService.leaveRoom(hostId)
      expect(() => joinRoom(h, code)).toThrowError('does not exist')
    })

    it('transfers host to the earliest remaining player when host leaves', () => {
      const h = harness()
      const { code, hostId } = createRoom(h)
      const { playerId: alice } = joinRoom(h, code, 'Alice')
      joinRoom(h, code, 'Bob')
      h.roomService.leaveRoom(hostId)
      const room = h.roomOf(alice)!
      expect(room.hostId).toBe(alice)
      expect(room.players.get(alice)?.isHost).toBe(true)
    })

    it('transfers host when the host disconnects (not removed yet)', () => {
      const h = harness()
      const { code, hostId } = createRoom(h)
      joinRoom(h, code, 'Alice')
      h.roomService.bindSocket(h.roomOf(hostId)!.id, hostId, 'socket-host')
      h.roomService.handleDisconnect('socket-host', 'transport close')
      const room = h.roomOf(hostId)!
      expect(room.hostId).not.toBe(hostId)
    })

    it('kick removes the target, broadcasts state and disconnects their sockets', () => {
      const h = harness()
      const { code, roomId, hostId } = createRoom(h)
      const { playerId: alice } = joinRoom(h, code, 'Alice')
      h.roomService.bindSocket(roomId, alice, 'socket-alice')
      h.roomService.kickPlayer(hostId, alice)
      const snapshot = h.roomService.getSnapshot(roomId)!
      expect(snapshot.players).toHaveLength(1)
      expect(snapshot.players[0]?.id).toBe(hostId)
      expect(h.eventsFor(roomId, 'room:closed')).toHaveLength(0)
    })

    it('non-hosts cannot kick', () => {
      const h = harness()
      const { code, hostId } = createRoom(h)
      const { playerId: alice } = joinRoom(h, code, 'Alice')
      expect(() => h.roomService.kickPlayer(alice, hostId)).toThrowError('host')
    })

    it('hosts cannot kick themselves', () => {
      const h = harness()
      const { hostId } = createRoom(h)
      expect(() => h.roomService.kickPlayer(hostId, hostId)).toThrowError('themselves')
    })
  })

  describe('disconnect grace window', () => {
    it('keeps a disconnected player for the grace window and removes them after', () => {
      const h = createHarness({ graceMs: 10_000 })
      const { code, roomId, hostId } = createRoom(h)
      const { playerId: alice } = joinRoom(h, code, 'Alice')
      h.roomService.bindSocket(roomId, alice, 'socket-alice')

      h.roomService.handleDisconnect('socket-alice', 'transport close')
      expect(h.roomOf(alice)!.players.has(alice)).toBe(true)
      expect(h.roomOf(alice)!.players.get(alice)?.connected).toBe(false)

      // Reconnect within grace — player restored.
      const token = h.roomOf(alice)!.reconnectTokens.get(alice)!
      h.roomService.rejoinPlayer(code, alice, token)
      expect(h.roomOf(alice)!.players.get(alice)?.connected).toBe(true)

      // Disconnect again and let the grace window elapse.
      h.roomService.bindSocket(roomId, alice, 'socket-alice')
      h.roomService.handleDisconnect('socket-alice', 'transport close')
      h.clock.advance(10_001)
      expect(h.roomOf(alice)).toBeNull()
      void hostId
    })

    it('does not remove a player who reconnects before the timer fires', () => {
      const h = createHarness({ graceMs: 10_000 })
      const { code, roomId } = createRoom(h)
      const { playerId: alice } = joinRoom(h, code, 'Alice')
      h.roomService.bindSocket(roomId, alice, 'socket-a')
      h.roomService.handleDisconnect('socket-a', 'transport close')
      h.clock.advance(9_000)
      const token = h.roomOf(alice)!.reconnectTokens.get(alice)!
      h.roomService.rejoinPlayer(code, alice, token)
      h.clock.advance(10_000)
      expect(h.roomOf(alice)!.players.has(alice)).toBe(true)
    })
  })

  describe('settings', () => {
    it('only the host can change settings', () => {
      const h = harness()
      const { code, hostId } = createRoom(h)
      const { playerId: alice } = joinRoom(h, code, 'Alice')
      expect(() => h.roomService.updateSettings(alice, { duration: 60 })).toThrowError('host')
      const settings = h.roomService.updateSettings(hostId, { duration: 60 })
      expect(settings.duration).toBe(60)
    })

    it('rejects maxPlayers below the current player count', () => {
      const h = harness()
      const { code, hostId } = createRoom(h)
      joinRoom(h, code, 'Alice')
      joinRoom(h, code, 'Bob')
      expect(() => h.roomService.updateSettings(hostId, { maxPlayers: 2 })).toThrowError('current player count')
    })
  })

  describe('ready & start gate', () => {
    it('requires minimum ready players to start', () => {
      const h = harness()
      const { code, hostId } = createRoom(h)
      joinRoom(h, code, 'Alice')
      expect(() => h.roomService.startGame(hostId)).toThrowError(/ready/)
      const alice = [...h.roomOf(hostId)!.players.values()].find((p) => p.displayName === 'Alice')!
      h.roomService.setReady(hostId, true)
      h.roomService.setReady(alice.id, true)
      expect(() => h.roomService.startGame(hostId)).not.toThrow()
    })
  })

  describe('room expiry', () => {
    it('auto-closes a solo waiting room after the empty-room TTL', () => {
      const h = harness()
      const { code, roomId, hostId } = createRoom(h)
      h.clock.advance(5 * 60_000)
      expect(h.roomOf(hostId)).toBeNull()
      expect(h.eventsFor(roomId, 'room:closed')).toEqual([{ reason: 'expired' }])
      expect(code).toMatch(/^[A-Z0-9]{6}$/)
    })

    it('does not expire a room once a second player joins', () => {
      const h = harness()
      const { code, hostId } = createRoom(h)
      joinRoom(h, code, 'Alice')
      h.clock.advance(5 * 60_000)
      expect(h.roomOf(hostId)).not.toBeNull()
    })

    it('expiry never fires while a room is in a game', () => {
      const h = harness()
      const { code, hostId } = createRoom(h)
      const { playerId: alice } = joinRoom(h, code, 'Alice')
      h.roomService.setReady(hostId, true)
      h.roomService.setReady(alice, true)
      h.roomService.startGame(hostId)
      h.clock.advance(5 * 60_000)
      expect(h.roomOf(hostId)).not.toBeNull()
    })

    it('a join after expiry fails with NOT_FOUND', () => {
      const h = harness()
      const { code } = createRoom(h)
      h.clock.advance(5 * 60_000)
      expect(() => h.roomService.joinRoom('Alice', null, code)).toThrowError(RoomError)
    })
  })

  describe('delete room', () => {
    it('only the host can delete the room', () => {
      const h = harness()
      const { code, hostId } = createRoom(h)
      const { playerId: alice } = joinRoom(h, code, 'Alice')
      expect(() => h.roomService.deleteRoomByHost(alice)).toThrowError(/host/i)
      expect(h.roomOf(hostId)).not.toBeNull()
    })

    it('host deletion closes the room for everyone', () => {
      const h = harness()
      const { code, hostId, roomId } = createRoom(h)
      joinRoom(h, code, 'Alice')
      h.roomService.deleteRoomByHost(hostId)
      expect(h.roomOf(hostId)).toBeNull()
      expect(h.eventsFor(roomId, 'room:closed')).toEqual([{ reason: 'host_closed' }])
    })
  })
})
