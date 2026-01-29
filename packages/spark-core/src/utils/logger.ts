import type { SparkComponentContext, SparkCapabilityProvider } from '../types/spark-component.js'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function formatMsg(level: LogLevel, args: unknown[]) {
  return [`[${new Date().toISOString()}]`, `[${level.toUpperCase()}]`, ...args]
}

export interface LoggerApi {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

/**
 * Create a logger instance. Prefer this API over any legacy helpers.
 * Signature: Logger(context?: any): LoggerApi
 */
export function Logger(context?: any): LoggerApi {
  // For now, context is unused — future enhancements can bind providers to context
  return {
    debug: (...args: unknown[]) => console.debug(...formatMsg('debug', args)),
    info: (...args: unknown[]) => console.info(...formatMsg('info', args)),
    warn: (...args: unknown[]) => console.warn(...formatMsg('warn', args)),
    error: (...args: unknown[]) => console.error(...formatMsg('error', args))
  }
}


export function createConsoleTransport(level: LogLevel = 'info') {
  return {
    level,
    log(_level: LogLevel, message: string, meta?: any) {
      const out = `[${_level.toUpperCase()}] ${message}`
      if (meta) console[_level === 'error' ? 'error' : 'log'](out, meta)
      else console[_level === 'error' ? 'error' : 'log'](out)
    }
  }
}

export function createHttpTransport(endpoint: string, level: LogLevel = 'error') {
  return {
    async log(_level: LogLevel, message: string, meta?: any) {
      try {
        // fire and forget
        await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ level: _level, message, meta }) })
      } catch (err) { /* ignore */ }
    }
  }
}

export function createMemoryTransport(storage: any[] = []) {
  return {
    log(level: LogLevel, message: string, meta?: any) { storage.push({ level, message, meta, ts: Date.now() }) }
  }
}
