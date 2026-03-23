/**
 * Application Logger
 * 应用层日志系统（独立实现）
 *
 * 职责：
 * 1. 应用级日志配置（级别、格式、颜色）
 * 2. 日志上报（可配置发送到后端，支持批量上传）
 * 3. 日志聚合与格式化
 * 4. 作用域日志（page、api、router 等）
 * 5. 全局传输器：所有 AppLogger 实例共享，main.ts 配置后全局生效
 *
 * 注意：
 * - 这是独立的 Logger 实现，不依赖 spark-component
 * - spark-component 有自己的轻量级 Logger
 */

/**
 * 日志级别（与 spark-utils 共享）
 */
export type { LogLevel } from '@spark-view/spark-utils'
import type { LogLevel } from '@spark-view/spark-utils'
import { createFetchClient } from '@spark-view/spark-utils'

/**
 * 应用层 Logger API 接口
 *
 * 与 spark-utils 的 LoggerApi 是不同的接口：
 * - spark-utils LoggerApi: 轻量级，(...args: unknown[]) => void
 * - AppLoggerApi: 结构化参数，(message: string, meta?) => void
 */
export interface AppLoggerApi {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, error?: Error | Record<string, unknown>): void
  success(message: string, meta?: Record<string, unknown>): void
}

/**
 * 日志配置
 */
export interface AppLoggerConfig {
  /** 最小日志级别 */
  level?: LogLevel
  /** 是否启用颜色 */
  enableColors?: boolean
  /** 是否显示时间戳 */
  showTimestamp?: boolean
  /** 日志前缀 */
  prefix?: string
  /** 是否启用远程日志上报 */
  enableRemote?: boolean
  /** 远程日志端点 */
  remoteEndpoint?: string
  /** 远程上报的最小日志级别（默认 'debug'，即上报所有级别） */
  minRemoteLevel?: LogLevel
  /** 批量上传：队列大小阈值（达到后立即 flush，默认 50） */
  batchSize?: number
  /** 批量上传：定时 flush 间隔（毫秒，默认 5000） */
  flushInterval?: number
}

/**
 * 日志传输器接口
 */
export interface LogTransport {
  send(level: LogLevel, message: string, meta?: Record<string, unknown>): void | Promise<void>
  /** 立即刷新队列中的日志（批量传输器可选实现） */
  flush?(): void
  /** 销毁传输器，释放定时器等资源 */
  destroy?(): void
}

/**
 * 日志级别优先级
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

/**
 * Emoji 图标
 */
const EMOJI_ICONS: Record<string, string> = {
  debug: '🐛',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
  success: '✅',
  loading: '⏳'
}

// ─── 全局传输器（所有 AppLogger 实例共享） ────────────────────────────────────

/**
 * 全局共享传输器列表。
 * 通过 `addGlobalTransport()` / `configureRemoteLogger()` 注入，
 * 所有 AppLogger 实例（含已创建的模块级单例）自动生效。
 */
const _globalTransports: LogTransport[] = []

/**
 * 添加全局传输器（对所有已创建和未来创建的 AppLogger 生效）
 */
export function addGlobalTransport(transport: LogTransport): void {
  _globalTransports.push(transport)
}

/**
 * 移除所有全局传输器（测试用）
 */
export function clearGlobalTransports(): void {
  for (const t of _globalTransports) {
    t.destroy?.()
  }
  _globalTransports.length = 0
}

/**
 * 获取当前全局传输器数量（调试 / 测试用）
 */
export function getGlobalTransportCount(): number {
  return _globalTransports.length
}

// ─── 批量 HTTP 传输器配置 ─────────────────────────────────────────────────────

export interface BatchTransportOptions {
  /** 远程端点 URL */
  endpoint: string
  /** 上报的最小日志级别（默认 'debug'） */
  minLevel?: LogLevel
  /** 队列大小阈值（默认 50） */
  batchSize?: number
  /** 定时 flush 间隔 ms（默认 5000） */
  flushInterval?: number
  /** 获取当前页面 ID（每条日志自动附带，用于 AI 闭环） */
  getPageId?: () => string | undefined
  /** 会话 ID（整个浏览器生命周期不变，用于 AI 闭环追踪） */
  sessionId?: string
}

interface LogEntry {
  level: LogLevel
  message: string
  meta?: Record<string, unknown> | undefined
  timestamp: number
  userAgent?: string | undefined
  /** 当前页面 ID（AI 闭环：标识日志来源页面） */
  pageId?: string | undefined
  /** 会话 ID（AI 闭环：追踪一次对话的所有日志） */
  sessionId?: string | undefined
}

/**
 * 创建批量 HTTP 传输器
 *
 * - 日志先缓存在内存队列中
 * - 达到 batchSize 或 flushInterval 到期时批量发送
 * - 页面隐藏 / 卸载时用 `navigator.sendBeacon` 兜底
 */
export function createBatchHttpTransport(options: BatchTransportOptions): LogTransport {
  const minLevelPriority = LOG_LEVELS[options.minLevel ?? 'debug']
  const batchSize = options.batchSize ?? 50
  const flushIntervalMs = options.flushInterval ?? 5000
  const endpoint = options.endpoint
  const getPageId = options.getPageId
  const sessionId = options.sessionId

  let queue: LogEntry[] = []
  let timer: ReturnType<typeof setInterval> | null = null
  const beaconClient = createFetchClient()

  function flush(): void {
    if (queue.length === 0) return
    const batch = queue
    queue = []
    beaconClient.beacon(endpoint, { logs: batch })
  }

  // 定时刷新
  timer = setInterval(flush, flushIntervalMs)

  // 页面隐藏 / 卸载时兜底刷新
  function onVisibilityChange(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      flush()
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  return {
    send(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
      if (LOG_LEVELS[level] < minLevelPriority) return
      queue.push({
        level,
        message,
        meta,
        timestamp: Date.now(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        pageId: getPageId?.(),
        sessionId,
      })
      if (queue.length >= batchSize) {
        flush()
      }
    },
    flush,
    destroy(): void {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
      flush() // 销毁前把剩余日志发出
    }
  }
}

/**
 * 一键配置远程日志上报（推荐在 main.ts 中调用）
 *
 * 内部创建 `createBatchHttpTransport` 并注入到全局传输器列表，
 * 所有已创建的 AppLogger 实例（startupLogger / pageLogger 等）自动生效。
 *
 * @example
 * ```ts
 * import { configureRemoteLogger } from '@spark-view/spark-app'
 *
 * const appConfig = await loadAppConfig()
 * if (appConfig.logger.enableRemote) {
 *   configureRemoteLogger({
 *     endpoint: appConfig.logger.remoteEndpoint ?? '/api/logs',
 *     minLevel: appConfig.logger.minRemoteLevel,
 *     batchSize: appConfig.logger.batchSize,
 *     flushInterval: appConfig.logger.flushInterval,
 *   })
 * }
 * ```
 */
export function configureRemoteLogger(options: BatchTransportOptions): LogTransport {
  const transport = createBatchHttpTransport(options)
  addGlobalTransport(transport)
  return transport
}

// ─── AppLogger 实现 ──────────────────────────────────────────────────────────

/**
 * 应用层 Logger 实现
 */
class AppLogger {
  private config: Required<Pick<AppLoggerConfig, 'level' | 'enableColors' | 'showTimestamp' | 'prefix' | 'enableRemote' | 'remoteEndpoint'>>
  private transports: LogTransport[] = []

  constructor(config: AppLoggerConfig = {}) {
    this.config = {
      level: config.level ?? (import.meta.env.PROD ? 'info' : 'debug'),
      enableColors: config.enableColors ?? true,
      showTimestamp: config.showTimestamp ?? false,
      prefix: config.prefix ?? '',
      enableRemote: config.enableRemote ?? false,
      remoteEndpoint: config.remoteEndpoint ?? '/api/logs'
    }

    // 实例级远程传输（向后兼容：当 AppLogger 直接配置 enableRemote 时）
    if (this.config.enableRemote) {
      this.addTransport(createHttpTransport(this.config.remoteEndpoint))
    }
  }

  /**
   * 添加实例级传输器
   */
  addTransport(transport: LogTransport): void {
    this.transports.push(transport)
  }

  /**
   * 检查是否应该输出日志
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level]
  }

  /**
   * 格式化消息
   */
  private formatMessage(message: string, emoji?: string): string {
    const parts: string[] = []

    if (this.config.showTimestamp) {
      parts.push(`[${new Date().toISOString()}]`)
    }

    if (this.config.prefix) {
      parts.push(`[${this.config.prefix}]`)
    }

    if (emoji) {
      parts.push(emoji)
    }

    parts.push(message)

    return parts.join(' ')
  }

  /**
   * 发送到所有传输器（实例级 + 全局）
   */
  private sendToTransports(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const allTransports = [...this.transports, ..._globalTransports]
    for (const transport of allTransports) {
      try {
        Promise.resolve(transport.send(level, message, meta ?? {})).catch((err: unknown) => {
          console.error('日志传输失败（异步）', err)
        })
      } catch (error) {
        console.error('日志传输失败', error)
      }
    }
  }

  /**
   * 记录日志并触发传输器
   */
  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return

    const emoji = EMOJI_ICONS[level]
    const formattedMessage = this.formatMessage(message, emoji)

    // 直接输出到控制台
    // Note: Logger 系统需要使用原生 console API 进行输出
    // eslint-disable-next-line no-console
    const consoleFn = level === 'debug' ? console.debug :
                     level === 'info' ? console.info :
                     level === 'warn' ? console.warn :
                     console.error

    if (meta) {
      consoleFn(formattedMessage, meta)
    } else {
      consoleFn(formattedMessage)
    }

    // 触发所有传输器（实例级 + 全局）
    this.sendToTransports(level, message, meta)
  }

  /**
   * Debug 日志
   */
  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta)
  }

  /**
   * Info 日志
   */
  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta)
  }

  /**
   * Warning 日志
   */
  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta)
  }

  /**
   * Error 日志
   */
  error(message: string, error?: Error | Record<string, unknown>): void {
    const meta = error instanceof Error
      ? { message: error.message, stack: error.stack }
      : error
    this.log('error', message, meta)
  }

  /**
   * Success 日志（扩展）
   */
  success(message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog('info')) return
    const formattedMessage = this.formatMessage(message, EMOJI_ICONS['success'])
    const args = meta ? [formattedMessage, meta] : [formattedMessage]
    console.info(...args)
    this.sendToTransports('info', message, meta)
  }
}

/**
 * HTTP 传输器（单条发送，向后兼容）
 *
 * 推荐使用 `createBatchHttpTransport` 或 `configureRemoteLogger` 替代。
 */
export function createHttpTransport(endpoint: string, options?: { minLevel?: LogLevel }): LogTransport {
  const minLevelPriority = LOG_LEVELS[options?.minLevel ?? 'warn']
  const httpClient = createFetchClient()
  return {
    async send(level: LogLevel, message: string, meta?: Record<string, unknown>) {
      if (LOG_LEVELS[level] < minLevelPriority) return

      try {
        await httpClient.post(endpoint, {
          level,
          message,
          meta,
          timestamp: Date.now(),
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined
        })
      } catch {
        // 静默失败，不影响应用
      }
    }
  }
}

/**
 * 创建应用 Logger
 */
export function createAppLogger(config?: AppLoggerConfig): AppLogger {
  return new AppLogger(config)
}

/**
 * 创建作用域 Logger
 */
export function createScopedLogger(scope: string, config?: AppLoggerConfig): AppLogger {
  return new AppLogger({
    ...config,
    prefix: scope
  })
}

/**
 * 创建作用域 Logger (便捷别名)
 */
export const createLogger = createScopedLogger

/**
 * 默认 Logger 实例
 */
export const appLogger = createAppLogger()
