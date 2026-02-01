/**
 * 应用层统一日志服务
 * 
 * 基于 @spark-view/spark-core 的 Logger，提供应用级的日志封装
 * 支持开发/生产环境配置、日志级别过滤、格式化输出
 */

import { Spark } from '@spark-view/spark-core'
import type { LoggerApi } from '@spark-view/spark-core'

/**
 * 日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * 日志配置
 */
export interface LogConfig {
  /** 最小日志级别 */
  level?: LogLevel
  /** 是否启用彩色输出 */
  enableColors?: boolean
  /** 是否显示时间戳 */
  showTimestamp?: boolean
  /** 日志前缀 */
  prefix?: string
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
 * 控制台颜色映射（支持浏览器 %c 语法）
 */
const CONSOLE_COLORS: Record<LogLevel, string> = {
  debug: 'color: #999; font-weight: normal',
  info: 'color: #0066cc; font-weight: bold',
  warn: 'color: #ff9900; font-weight: bold',
  error: 'color: #cc0000; font-weight: bold'
}

/**
 * Emoji 图标映射
 */
const EMOJI_ICONS: Record<string, string> = {
  debug: '🐛',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
  success: '✅',
  loading: '⏳',
  data: '📊',
  api: '📡',
  event: '🎯',
  sync: '🔄',
  inject: '🔧',
  package: '📦'
}

class AppLogger {
  private logger: LoggerApi
  private config: Required<LogConfig>

  constructor(config: LogConfig = {}) {
    this.config = {
      level: config.level || (import.meta.env.DEV ? 'debug' : 'info'),
      enableColors: config.enableColors ?? true,
      showTimestamp: config.showTimestamp ?? false,
      prefix: config.prefix || ''
    }

    // 使用 Spark 核心 Logger
    this.logger = Spark.Logger()
  }

  /**
   * 检查是否应该输出该级别的日志
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level]
  }

  /**
   * 格式化日志消息
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
   * Debug 级别日志
   */
  debug(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('debug')) return
    
    const formatted = this.formatMessage(message, EMOJI_ICONS.debug)
    
    if (this.config.enableColors && typeof window !== 'undefined') {
      this.logger.debug(`%c${formatted}`, CONSOLE_COLORS.debug, ...args)
    } else {
      this.logger.debug(formatted, ...args)
    }
  }

  /**
   * Info 级别日志
   */
  info(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('info')) return
    
    const formatted = this.formatMessage(message, EMOJI_ICONS.info)
    
    if (this.config.enableColors && typeof window !== 'undefined') {
      this.logger.info(`%c${formatted}`, CONSOLE_COLORS.info, ...args)
    } else {
      this.logger.info(formatted, ...args)
    }
  }

  /**
   * Warn 级别日志
   */
  warn(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('warn')) return
    
    const formatted = this.formatMessage(message, EMOJI_ICONS.warn)
    
    if (this.config.enableColors && typeof window !== 'undefined') {
      this.logger.warn(`%c${formatted}`, CONSOLE_COLORS.warn, ...args)
    } else {
      this.logger.warn(formatted, ...args)
    }
  }

  /**
   * Error 级别日志
   */
  error(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('error')) return
    
    const formatted = this.formatMessage(message, EMOJI_ICONS.error)
    
    if (this.config.enableColors && typeof window !== 'undefined') {
      this.logger.error(`%c${formatted}`, CONSOLE_COLORS.error, ...args)
    } else {
      this.logger.error(formatted, ...args)
    }
  }

  /**
   * 带自定义 Emoji 的日志
   */
  withEmoji(emoji: string, level: LogLevel, message: string, ...args: unknown[]): void {
    if (!this.shouldLog(level)) return
    
    const formatted = this.formatMessage(message, emoji)
    
    if (this.config.enableColors && typeof window !== 'undefined') {
      this.logger[level](`%c${formatted}`, CONSOLE_COLORS[level], ...args)
    } else {
      this.logger[level](formatted, ...args)
    }
  }

  /**
   * Success 日志（info 级别 + ✅）
   */
  success(message: string, ...args: unknown[]): void {
    this.withEmoji(EMOJI_ICONS.success, 'info', message, ...args)
  }

  /**
   * Loading 日志（info 级别 + ⏳）
   */
  loading(message: string, ...args: unknown[]): void {
    this.withEmoji(EMOJI_ICONS.loading, 'info', message, ...args)
  }

  /**
   * Data 日志（debug 级别 + 📊）
   */
  data(message: string, ...args: unknown[]): void {
    this.withEmoji(EMOJI_ICONS.data, 'debug', message, ...args)
  }

  /**
   * API 日志（info 级别 + 📡）
   */
  api(message: string, ...args: unknown[]): void {
    this.withEmoji(EMOJI_ICONS.api, 'info', message, ...args)
  }

  /**
   * Event 日志（debug 级别 + 🎯）
   */
  event(message: string, ...args: unknown[]): void {
    this.withEmoji(EMOJI_ICONS.event, 'debug', message, ...args)
  }

  /**
   * Sync 日志（debug 级别 + 🔄）
   */
  sync(message: string, ...args: unknown[]): void {
    this.withEmoji(EMOJI_ICONS.sync, 'debug', message, ...args)
  }

  /**
   * Inject 日志（debug 级别 + 🔧）
   */
  inject(message: string, ...args: unknown[]): void {
    this.withEmoji(EMOJI_ICONS.inject, 'debug', message, ...args)
  }

  /**
   * Package 日志（info 级别 + 📦）
   */
  package(message: string, ...args: unknown[]): void {
    this.withEmoji(EMOJI_ICONS.package, 'info', message, ...args)
  }

  /**
   * 创建带前缀的子 Logger
   */
  createChild(prefix: string): AppLogger {
    return new AppLogger({
      ...this.config,
      prefix: this.config.prefix ? `${this.config.prefix}:${prefix}` : prefix
    })
  }

  /**
   * 更新配置
   */
  setConfig(config: Partial<LogConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.config.level = level
  }
}

/**
 * 默认日志实例
 */
export const logger = new AppLogger()

/**
 * 页面日志实例（带前缀）
 */
export const pageLogger = logger.createChild('Page')

/**
 * API 日志实例（带前缀）
 */
export const apiLogger = logger.createChild('API')

/**
 * DataSet 日志实例（带前缀）
 */
export const dataLogger = logger.createChild('Data')

/**
 * 创建自定义 Logger
 */
export function createLogger(config?: LogConfig): AppLogger {
  return new AppLogger(config)
}

/**
 * 导出类型
 */
export type { LoggerApi }
export { AppLogger }
