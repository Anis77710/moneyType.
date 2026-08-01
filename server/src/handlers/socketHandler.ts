import type { Server as IOServer, Socket } from 'socket.io'
import type { ServerConfig } from '../config.js'
import { Logger } from '../logger.js'
import type { RoomService } from '../services/roomService.js'
import type { BroadcastBus } from '../services/roomService.js'
import { RoomError } from '../services/roomService.js'
import { TextService } from '../services/textService.js'
import { ClientEvents, DEFAULTS, ServerEvents } from '../../../shared/types.js'
import type { ServerErrorPayload, ServerErrorCode } from '../../../shared/types.js'
import {
  sanitizeCreateRoom,
  sanitizeJoinRoom,
  sanitizeRejoinRoom,
  sanitizeSettingsPatch,
  sanitizeDisplayName,
} from '../validation/schema.js'

export interface SocketHandlerDeps {
  io: IOServer
  roomService: RoomService
  textService: TextService
  config: ServerConfig
  logger?: Logger
  now?: () => number
}

interface SocketData {
  roomId: string | null
  playerId: string | null
}

/**
 * Socket layer: translates raw socket.io events into validated service calls
 * and implements the BroadcastBus so services stay decoupled from the IO
 * layer. All listeners are bound per-connection and fully cleaned up on
 * disconnect — no listener leaks, no timers left behind.
 */
export class SocketHandler implements BroadcastBus {
  private readonly io: IOServer
  private readonly roomService: RoomService
  private readonly logger: Logger
  private readonly now: () => number

  constructor(deps: SocketHandlerDeps) {
    this.io = deps.io
    this.roomService = deps.roomService
    this.logger = deps.logger ?? new Logger('info')
    this.now = deps.now ?? Date.now
    this.io.on('connection', (socket) => this.handleConnection(socket))
  }

  // -------------------------------------------------------------------------
  // BroadcastBus implementation
  // -------------------------------------------------------------------------

  toRoom(roomId: string, event: string, payload: unknown): void {
    this.io.to(roomId).emit(event, payload)
  }

  toPlayer(roomId: string, playerId: string, event: string, payload: unknown): void {
    const room = this.roomService._getRoomById(roomId)
    if (!room) return
    for (const socketId of this.roomService.getSocketIdsForPlayer(room, playerId)) {
      this.io.to(socketId).emit(event, payload)
    }
  }

  toPlayerSockets(roomId: string, playerId: string, event: string, payload: unknown): void {
    this.toPlayer(roomId, playerId, event, payload)
  }

  disconnectPlayerSockets(roomId: string, playerId: string): void {
    const room = this.roomService._getRoomById(roomId)
    if (!room) return
    for (const socketId of this.roomService.getSocketIdsForPlayer(room, playerId)) {
      const socket = this.io.sockets.sockets.get(socketId)
      socket?.emit(ServerEvents.ROOM_CLOSED, { reason: 'kicked' })
      socket?.disconnect(true)
    }
  }

  // -------------------------------------------------------------------------
  // Connection lifecycle
  // -------------------------------------------------------------------------

  private handleConnection(socket: Socket): void {
    const data: SocketData = { roomId: null, playerId: null }

    const emitError = (code: ServerErrorCode, message: string): void => {
      socket.emit(ServerEvents.ERROR, { code, message } satisfies ServerErrorPayload)
    }
    const run = (fn: () => void): void => {
      try {
        fn()
      } catch (err) {
        if (err instanceof RoomError) emitError(err.code as ServerErrorCode, err.message)
        else {
          this.logger.error('unhandled handler error', { error: err instanceof Error ? err.message : String(err) })
          emitError('INVALID_STATE', 'Something went wrong.')
        }
      }
    }

    // --- handshake events -----------------------------------------------------

    socket.on(ClientEvents.CREATE_ROOM, (payload: unknown, ack?: (ok: boolean) => void) => {
      run(() => {
        const displayName = sanitizeDisplayName(this.getAuthName(socket))
        const userId = this.getAuthUserId(socket)
        const sanitized = sanitizeCreateRoom(payload, displayName, userId)
        if (!sanitized) {
          emitError('INVALID_ARGUMENT', 'Invalid room configuration.')
          return
        }
        const { room, playerId, reconnectToken } = this.roomService.createRoom(sanitized)
        this.attachPlayer(socket, data, room.id, playerId, reconnectToken)
        ack?.(true)
      })
    })

    socket.on(ClientEvents.JOIN_ROOM, (payload: unknown, ack?: (ok: boolean) => void) => {
      run(() => {
        const displayName = sanitizeDisplayName(this.getAuthName(socket))
        const userId = this.getAuthUserId(socket)
        const sanitized = sanitizeJoinRoom(payload, displayName, userId)
        if (!sanitized) {
          emitError('INVALID_ARGUMENT', 'Invalid join payload.')
          return
        }
        const { room, playerId, reconnectToken } = this.roomService.joinRoom(
          sanitized.displayName,
          sanitized.userId,
          sanitized.code,
        )
        this.attachPlayer(socket, data, room.id, playerId, reconnectToken)
        ack?.(true)
      })
    })

    socket.on(ClientEvents.REJOIN_ROOM, (payload: unknown, ack?: (ok: boolean) => void) => {
      run(() => {
        const sanitized = sanitizeRejoinRoom(payload)
        if (!sanitized) {
          emitError('INVALID_TOKEN', 'Invalid reconnect payload.')
          return
        }
        const { room, playerId } = this.roomService.rejoinPlayer(
          sanitized.code,
          sanitized.playerId,
          sanitized.token,
        )
        this.attachPlayer(socket, data, room.id, playerId, null)
        ack?.(true)
      })
    })

    // --- authenticated room events ---------------------------------------------

    const requirePlayer = (): { roomId: string; playerId: string } | null => {
      if (!data.roomId || !data.playerId) {
        emitError('NOT_FOUND', 'You are not in a room.')
        return null
      }
      return { roomId: data.roomId, playerId: data.playerId }
    }

    socket.on(ClientEvents.LEAVE_ROOM, () => {
      const ctx = requirePlayer()
      if (!ctx) return
      run(() => this.roomService.leaveRoom(ctx.playerId))
      socket.leave(ctx.roomId)
      data.roomId = null
      data.playerId = null
    })

    socket.on(ClientEvents.KICK_PLAYER, (payload: unknown) => {
      const ctx = requirePlayer()
      if (!ctx) return
      run(() => {
        const targetId = typeof payload === 'object' && payload !== null && typeof (payload as Record<string, unknown>).playerId === 'string'
          ? ((payload as Record<string, unknown>).playerId as string)
          : ''
        if (!targetId) {
          emitError('INVALID_ARGUMENT', 'Missing playerId.')
          return
        }
        this.roomService.kickPlayer(ctx.playerId, targetId)
      })
    })

    socket.on(ClientEvents.SET_READY, (payload: unknown) => {
      const ctx = requirePlayer()
      if (!ctx) return
      run(() => this.roomService.setReady(ctx.playerId, payload === true))
    })

    socket.on(ClientEvents.UPDATE_SETTINGS, (payload: unknown) => {
      const ctx = requirePlayer()
      if (!ctx) return
      run(() => {
        const patch = sanitizeSettingsPatch(payload)
        if (patch) this.roomService.updateSettings(ctx.playerId, patch)
      })
    })

    socket.on(ClientEvents.START_GAME, () => {
      const ctx = requirePlayer()
      if (!ctx) return
      run(() => this.roomService.startGame(ctx.playerId))
    })

    socket.on(ClientEvents.DELETE_ROOM, () => {
      const ctx = requirePlayer()
      if (!ctx) return
      run(() => this.roomService.deleteRoomByHost(ctx.playerId))
      socket.leave(ctx.roomId)
      data.roomId = null
      data.playerId = null
    })

    socket.on(ClientEvents.PLAY_AGAIN, () => {
      const ctx = requirePlayer()
      if (!ctx) return
      run(() => this.roomService.playAgain(ctx.playerId))
    })

    socket.on(ClientEvents.RETURN_TO_LOBBY, () => {
      const ctx = requirePlayer()
      if (!ctx) return
      run(() => this.roomService.returnToLobby(ctx.playerId))
    })

    socket.on(ClientEvents.PROGRESS, (payload: unknown) => {
      const ctx = requirePlayer()
      if (!ctx) return
      run(() => this.roomService.handleProgress(ctx.playerId, payload))
    })

    socket.on(ClientEvents.REQUEST_ROOMS, (_payload: unknown, ack?: (rooms: unknown) => void) => {
      run(() => {
        ack?.(this.roomService.listPublicRooms(DEFAULTS.ROOM_LIST_LIMIT))
      })
    })

    socket.on(ClientEvents.PING, () => {
      socket.emit(ServerEvents.PONG, { t: this.now() })
    })

    socket.on(ClientEvents.PING_REPORT, (payload: unknown) => {
      const ctx = requirePlayer()
      if (!ctx) return
      if (typeof payload === 'object' && payload !== null) {
        const rtt = (payload as Record<string, unknown>).rtt
        if (typeof rtt === 'number' && Number.isFinite(rtt) && rtt >= 0 && rtt < 30_000) {
          this.roomService.updatePing(ctx.playerId, Math.round(rtt))
        }
      }
    })

    socket.on('disconnect', (reason: string) => {
      // Unbind before notifying the service so the service never sees a stale binding.
      const playerId = this.roomService.unbindSocket(socket.id)
      if (playerId) {
        this.logger.debug('socket disconnected', { socketId: socket.id, reason })
        this.roomService.handleDisconnect(socket.id, reason)
      }
      data.roomId = null
      data.playerId = null
    })
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private attachPlayer(
    socket: Socket,
    data: SocketData,
    roomId: string,
    playerId: string,
    reconnectToken: string | null,
  ): void {
    // Multi-tab protection: if this player already owns a live socket in the
    // room, terminate it so only one socket can drive the player session.
    const room = this.roomService._getRoomById(roomId)
    if (room) {
      for (const socketId of this.roomService.getSocketIdsForPlayer(room, playerId)) {
        if (socketId !== socket.id) {
          const other = this.io.sockets.sockets.get(socketId)
          other?.emit(ServerEvents.ROOM_CLOSED, { reason: 'kicked' })
          other?.disconnect(true)
        }
      }
    }
    void socket.join(roomId)
    this.roomService.bindSocket(roomId, playerId, socket.id)
    data.roomId = roomId
    data.playerId = playerId

    const snapshot = this.roomService.getSnapshot(roomId, playerId)
    const gameState = this.roomService.getGameStateForReconnect(roomId)
    const self = {
      playerId,
      reconnectToken,
    }
    socket.emit(ServerEvents.ROOM_SNAPSHOT, { snapshot, game: gameState, self })
  }

  private getAuthName(socket: Socket): string {
    const handshake = socket.handshake.auth as Record<string, unknown> | undefined
    if (typeof handshake?.name === 'string') return handshake.name
    return 'Player'
  }

  private getAuthUserId(socket: Socket): string | null {
    const handshake = socket.handshake.auth as Record<string, unknown> | undefined
    if (typeof handshake?.userId === 'string' && handshake.userId.length > 0 && handshake.userId.length <= 100) {
      return handshake.userId
    }
    return null
  }
}

