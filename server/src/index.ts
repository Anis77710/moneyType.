import http from 'node:http'
import { fileURLToPath, pathToFileURL } from 'node:url'
import express from 'express'
import { Server as IOServer } from 'socket.io'
import { loadConfig } from './config.js'
import { Logger } from './logger.js'
import { RoomService } from './services/roomService.js'
import { GameService } from './services/gameService.js'
import { TextService } from './services/textService.js'
import { SocketHandler } from './handlers/socketHandler.js'

/**
 * Typee real-time multiplayer server.
 *
 * Run:  npm run dev (server/) — dev with watch
 *       npm run build && npm start — production
 *
 * Env:
 *   PORT              (default 3001)
 *   CORS_ORIGINS      comma-separated list of allowed origins
 *   LOG_LEVEL         debug | info | warn | error
 *   DISCONNECT_GRACE_MS  how long a dropped player is kept before removal
 */
export function createServer(config = loadConfig()) {
  const logger = new Logger(config.logLevel)
  const app = express()
  const httpServer = http.createServer(app)

  const io = new IOServer(httpServer, {
    cors: {
      origin: config.corsOrigins,
      methods: ['GET', 'POST'],
      credentials: false,
    },
    // Conservative transports; websocket avoids polling overhead for races.
    transports: ['websocket', 'polling'],
    pingInterval: 25_000,
    pingTimeout: 20_000,
  })

  app.get('/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime(), rooms: roomService.roomCount })
  })

  const textService = new TextService()
  const gameService = new GameService({ textService, logger })
  const roomService = new RoomService({
    gameService,
    logger,
    disconnectGraceMs: config.disconnectGraceMs,
  })

  // The bus is the SocketHandler itself; wire it up after construction.
  const handler = new SocketHandler({ io, roomService, textService, config, logger })
  roomService.setBus(handler)

  function shutdown(signal: string): void {
    logger.info('shutting down', { signal })
    roomService.closeAllRooms('server_shutdown')
    io.close(() => {
      httpServer.close(() => {
        logger.info('server stopped')
        process.exit(0)
      })
    })
    setTimeout(() => process.exit(1), config.shutdownGraceMs).unref()
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('uncaughtException', (err) => {
    logger.error('uncaught exception', { error: err.message, stack: err.stack })
    shutdown('uncaughtException')
  })
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled rejection', { reason: String(reason) })
  })

  return {
    app,
    httpServer,
    io,
    roomService,
    gameService,
    handler,
    start: (port = config.port) =>
      new Promise<void>((resolve) => {
        httpServer.listen(port, () => {
          logger.info('server listening', { port, cors: config.corsOrigins })
          resolve()
        })
      }),
  }
}

// Direct execution (not imported by tests)
const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (entryPath && fileURLToPath(import.meta.url).replace(/\\/g, '/') === fileURLToPath(entryPath).replace(/\\/g, '/')) {
  createServer().start()
}
