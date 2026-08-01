import { DEFAULTS } from '../../shared/types.js'

export interface ServerConfig {
  port: number
  corsOrigins: string[]
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  /** How long a disconnected player is retained before being removed from the room. */
  disconnectGraceMs: number
  /** How long to wait for in-flight broadcasts during shutdown. */
  shutdownGraceMs: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? '3001')
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid PORT: ${env.PORT}`)
  }
  const logLevel = (env.LOG_LEVEL ?? 'info') as ServerConfig['logLevel']
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    throw new Error(`Invalid LOG_LEVEL: ${env.LOG_LEVEL}`)
  }
  return {
    port,
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    logLevel,
    disconnectGraceMs: Number(env.DISCONNECT_GRACE_MS ?? DEFAULTS.DISCONNECT_GRACE_MS),
    shutdownGraceMs: Number(env.SHUTDOWN_GRACE_MS ?? '2_000'),
  }
}
