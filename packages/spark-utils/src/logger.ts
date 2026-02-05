
/* eslint-disable no-console */

import type { LogLevel, AnyFunction, LoggerApi } from './types/common.js'

function formatMsg(level: LogLevel, args: unknown[]) {
  return [`[${new Date().toISOString()}]`, `[${level.toUpperCase()}]`, ...args]
}

/**
 * Create a logger instance. Prefer this API over any legacy helpers.
 * Signature: Logger(context?: unknown): LoggerApi
 */

export function Logger(context?: unknown): LoggerApi {
  // Prefer context-level provider, then fallback to console
  const providersSet = typeof context === 'object' && context && 'providers' in context
    ? (context.providers as Set<Record<string, unknown>> | undefined)
    : undefined
    
  const ctxProvider = providersSet
    ? Array.from(providersSet).find((p) => typeof p.name === 'string' && p.name === 'logger')
    : undefined
    
  const provider = ctxProvider
  const impl = provider
    ? ('implementation' in provider ? provider.implementation : provider)
    : null

  const call = (fnName: 'debug' | 'info' | 'warn' | 'error', args: unknown[]) => {
    if (impl && typeof impl === 'object' && fnName in impl) {
      const fn = (impl as Record<string, unknown>)[fnName]
      if (typeof fn === 'function') {
        /**
         * 类型断言说明：
         * 从动态对象中获取的函数，需要断言为 AnyFunction 以调用可变参数。
         * Logger 提供者可能来自不同源，无法预先知道精确签名。
         */
        return (fn as AnyFunction)(...args)
      }
    }
    
    // fallback to console
    if (fnName === 'debug') return console.debug(...formatMsg('debug', args))
    if (fnName === 'info') return console.info(...formatMsg('info', args))
    if (fnName === 'warn') return console.warn(...formatMsg('warn', args))
    return console.error(...formatMsg('error', args))
  }

  return {
    debug: (...args: unknown[]) => call('debug', args),
    info: (...args: unknown[]) => call('info', args),
    warn: (...args: unknown[]) => call('warn', args),
    error: (...args: unknown[]) => call('error', args)
  }
}


export function createConsoleTransport(_level: LogLevel = 'info') {
  return {
    level: _level,
    log(_level: LogLevel, message: string, meta?: unknown) {
      const out = `[${_level.toUpperCase()}] ${message}`
      if (meta) console[_level === 'error' ? 'error' : 'log'](out, meta)
      else console[_level === 'error' ? 'error' : 'log'](out)
    }
  }
}

export function createHttpTransport(endpoint: string, _level: LogLevel = 'error') {
  return {
    async log(_level: LogLevel, message: string, meta?: unknown) {
      try {
        // fire and forget
        await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ level: _level, message, meta }) })
      } catch { /* ignore */ }
    }
  }
}

export function createMemoryTransport(storage: unknown[] = []) {
  return {
    log(level: LogLevel, message: string, meta?: unknown) { storage.push({ level, message, meta, ts: Date.now() }) }
  }
}
