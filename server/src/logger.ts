type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

/**
 * Minimal structured logger. In production this can be swapped for
 * pino/winston without touching call sites.
 */
export class Logger {
  private readonly minLevel: number

  constructor(level: LogLevel = 'info') {
    this.minLevel = LEVEL_ORDER[level]
  }

  debug(msg: string, meta?: Record<string, unknown>): void {
    this.write('debug', msg, meta)
  }

  info(msg: string, meta?: Record<string, unknown>): void {
    this.write('info', msg, meta)
  }

  warn(msg: string, meta?: Record<string, unknown>): void {
    this.write('warn', msg, meta)
  }

  error(msg: string, meta?: Record<string, unknown>): void {
    this.write('error', msg, meta)
  }

  private write(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < this.minLevel) return
    const line = JSON.stringify({
      level,
      msg,
      ts: new Date().toISOString(),
      ...meta,
    })
    if (level === 'error') {
      // eslint-disable-next-line no-console
      console.error(line)
    } else {
      // eslint-disable-next-line no-console
      console.log(line)
    }
  }
}

export const defaultLogger = new Logger()
