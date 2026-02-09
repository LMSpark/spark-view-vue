/* eslint-disable no-console */

/**
 * 日志级别枚举
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Logger API 接口定义
 */
export interface LoggerApi {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

/**
 * 日志传输器接口
 * 用于自定义日志输出方式（如控制台、HTTP、文件等）
 */
export interface Transport {
  level?: LogLevel
  log: (level: LogLevel, message: string, meta?: unknown) => void | Promise<void>
}

/**
 * 格式化日志消息
 * @param level 日志级别
 * @param args 日志参数
 * @returns 格式化后的消息数组
 */
function formatMsg(level: LogLevel, args: unknown[]) {
  return [`[${new Date().toISOString()}]`, `[${level.toUpperCase()}]`, ...args]
}

/**
 * 创建 Logger 实例
 *
 * 这是推荐的日志 API，支持以下使用方式：
 * 1. 简单调用：Logger('MyModule') - 默认使用 console 输出
 * 2. 上下文注入：Logger(context) - 使用上下文中的自定义 logger provider
 *
 * @param context 可选的上下文对象，用于查找自定义 logger provider
 * @returns LoggerApi 实例
 */
export function Logger(context?: unknown): LoggerApi {
  // 优先使用上下文级别的 provider，然后 fallback 到 console
  const providersMap = typeof context === 'object' && context && 'providers' in context
    ? (context.providers as Map<string, Record<string, unknown>> | undefined)
    : undefined

  // 尝试从上下文获取 logger provider
  const ctxProvider = providersMap?.get('logger')

  // 提取 provider 的实现部分
  const provider = ctxProvider
  const impl = provider
    ? ('implementation' in provider ? provider.implementation : provider)
    : null

  /**
   * 调用日志方法
   * @param fnName 方法名
   * @param args 参数列表
   */
  const call = (fnName: 'debug' | 'info' | 'warn' | 'error', args: unknown[]) => {
    // 如果有自定义实现，优先使用
    if (impl && typeof impl === 'object' && fnName in impl) {
      const fn = (impl as Record<string, unknown>)[fnName]
      if (typeof fn === 'function') {
        return (fn as (...args: unknown[]) => void)(...args)
      }
    }

    // fallback 到 console
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


/**
 * 创建控制台传输器
 * @param minLevel 最小日志级别（低于此级别的日志将被忽略）
 * @returns Transport 实例
 */
export function createConsoleTransport(minLevel: LogLevel = 'info'): Transport {
  return {
    level: minLevel,
    log(level: LogLevel, message: string, meta?: unknown) {
      const out = `[${level.toUpperCase()}] ${message}`
      if (meta) console[level === 'error' ? 'error' : 'log'](out, meta)
      else console[level === 'error' ? 'error' : 'log'](out)
    }
  }
}

/**
 * 创建 HTTP 传输器
 * 将日志发送到远程服务器
 * @param endpoint HTTP 端点 URL
 * @param minLevel 最小日志级别
 * @returns Transport 实例
 */
export function createHttpTransport(endpoint: string, minLevel: LogLevel = 'error'): Transport {
  return {
    level: minLevel,
    async log(level: LogLevel, message: string, meta?: unknown) {
      try {
        // fire and forget
        await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ level, message, meta }) })
      } catch { /* ignore */ }
    }
  }
}

/**
 * 创建内存传输器
 * 将日志存储在内存数组中，主要用于测试
 * @param storage 存储日志的数组
 * @returns Transport 实例
 */
export function createMemoryTransport(storage: unknown[] = []) {
  return {
    log(level: LogLevel, message: string, meta?: unknown) { storage.push({ level, message, meta, ts: Date.now() }) }
  }
}
