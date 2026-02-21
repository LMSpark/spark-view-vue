/**
 * Application Logger
 * 应用层日志系统（独立实现）
 * 
 * 职责：
 * 1. 应用级日志配置（级别、格式、颜色）
 * 2. 日志上报（生产环境发送到后端）
 * 3. 日志聚合与格式化
 * 4. 作用域日志（page、api、router 等）
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
}

/**
 * 日志传输器接口
 */
export interface LogTransport {
  send(level: LogLevel, message: string, meta?: Record<string, unknown>): void | Promise<void>
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

/**
 * 应用层 Logger 实现
 */
class AppLogger {
  private config: Required<AppLoggerConfig>
  private transports: LogTransport[] = []

  constructor(config: AppLoggerConfig = {}) {
    this.config = {
      level: config.level ?? (typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'production' ? 'info' : 'debug'),
      enableColors: config.enableColors ?? true,
      showTimestamp: config.showTimestamp ?? false,
      prefix: config.prefix ?? '',
      enableRemote: config.enableRemote ?? false,
      remoteEndpoint: config.remoteEndpoint ?? '/api/logs'
    }

    // 生产环境启用远程传输
    if (this.config.enableRemote) {
      this.addTransport(createHttpTransport(this.config.remoteEndpoint))
    }
  }

  /**
   * 添加传输器
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

    // 触发所有传输器
    this.transports.forEach(transport => {
      try {
        void transport.send(level, message, meta ?? {})
      } catch (error) {
        // Fallback to console when logger transport fails
        console.error('日志传输失败', error)
      }
    })
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
    const formattedMessage = this.formatMessage(message, EMOJI_ICONS['success'])
    const args = meta ? [formattedMessage, meta] : [formattedMessage]
    console.info(...args)
    this.transports.forEach(t => t.send('info', message, meta))
  }
}

/**
 * HTTP 传输器（发送到后端）
 */
export function createHttpTransport(endpoint: string): LogTransport {
  return {
    async send(level: LogLevel, message: string, meta?: Record<string, unknown>) {
      // 只上报 error 和 warn
      if (level !== 'error' && level !== 'warn') return

      try {
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            level,
            message,
            meta,
            timestamp: Date.now(),
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined
          })
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

/**
 * 常用作用域 Logger
 */
export const pageLogger = createScopedLogger('Page')
export const apiLogger = createScopedLogger('API')
export const routerLogger = createScopedLogger('Router')
