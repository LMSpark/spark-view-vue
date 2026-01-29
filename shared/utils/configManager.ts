// shared/utils/configManager.ts
// 统一配置管理工具

import { Spark } from '@spark-view/spark-core'

export interface ConfigValidationRule {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  required?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enum?: any[]
  min?: number
  max?: number
  pattern?: RegExp
}

export interface ConfigSchema {
  [key: string]: ConfigValidationRule
}

/**
 * 配置管理器类
 */
export class ConfigManager {
  private static instance: ConfigManager | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static config: Record<string, any> = {}
  private static schema: ConfigSchema = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static watchers: Map<string, Set<(value: any) => void>> = new Map()
  private static logger = Spark.logger()

  /**
   * 获取单例实例
   */
  static getInstance(): ConfigManager {
    if (!this.instance) {
      this.instance = new ConfigManager()
    }
    return this.instance
  }

  /**
   * 设置配置模式
   */
  static setSchema(schema: ConfigSchema): void {
    this.schema = schema
  }

  /**
   * 获取配置值，支持默认值
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static get<T = any>(key: string, defaultValue?: T): T | undefined {
    return this.config[key] ?? defaultValue
  }

  /**
   * 设置配置值
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static set<T = any>(key: string, value: T): void {
    const oldValue = this.config[key]

    // 验证值
    if (!this.validateValue(key, value)) {
      throw new Error(`Invalid value for config key '${key}': ${value}`)
    }

    this.config[key] = value

    // 通知监听器
    if (oldValue !== value) {
      this.notifyWatchers(key, value)
    }

    this.logger.info(`Config updated: ${key} = ${JSON.stringify(value)}`)
  }

  /**
   * 批量设置配置
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static setMultiple(configs: Record<string, any>): void {
    Object.entries(configs).forEach(([key, value]) => {
      this.set(key, value)
    })
  }

  /**
   * 删除配置项
   */
  static delete(key: string): void {
    const oldValue = this.config[key]
    delete this.config[key]

    // 通知监听器
    if (oldValue !== undefined) {
      this.notifyWatchers(key, undefined)
    }

    this.logger.info(`Config deleted: ${key}`)
  }

  /**
   * 检查配置是否存在
   */
  static has(key: string): boolean {
    return key in this.config
  }

  /**
   * 从环境变量加载配置
   */
  static loadFromEnv(prefix: string = 'VITE_'): void {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const envConfig: Record<string, any> = {}

      Object.keys(import.meta.env).forEach(key => {
        if (key.startsWith(prefix)) {
          const configKey = key.slice(prefix.length).toLowerCase()
          envConfig[configKey] = import.meta.env[key]
        }
      })

      this.setMultiple(envConfig)
    }
  }

  /**
   * 监听配置变化
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static watch(key: string, callback: (value: any) => void): () => void {
    if (!this.watchers.has(key)) {
      this.watchers.set(key, new Set())
    }

    this.watchers.get(key)!.add(callback)

    // 返回取消监听的函数
    return () => {
      const watchers = this.watchers.get(key)
      if (watchers) {
        watchers.delete(callback)
        if (watchers.size === 0) {
          this.watchers.delete(key)
        }
      }
    }
  }

  /**
   * 验证配置
   */
  static validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    Object.entries(this.schema).forEach(([key, rule]) => {
      const value = this.config[key]

      if (rule.required && (value === undefined || value === null)) {
        errors.push(`Required config '${key}' is missing`)
        return
      }

      if (value !== undefined && !this.validateValue(key, value)) {
        errors.push(`Invalid value for config '${key}': ${value}`)
      }
    })

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * 重置配置
   */
  static reset(): void {
    this.config = {}
    this.watchers.clear()
    this.logger.info('Config reset')
  }

  /**
   * 获取所有配置
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static getAll(): Record<string, any> {
    return { ...this.config }
  }

  /**
   * 验证单个值
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static validateValue(key: string, value: any): boolean {
    const rule = this.schema[key]
    if (!rule) return true // 没有规则则通过

    // 检查类型
    if (rule.type && typeof value !== rule.type) {
      return false
    }

    // 检查枚举
    if (rule.enum && !rule.enum.includes(value)) {
      return false
    }

    // 检查数字范围
    if (typeof value === 'number') {
      if (rule.min !== undefined && value < rule.min) return false
      if (rule.max !== undefined && value > rule.max) return false
    }

    // 检查字符串模式
    if (typeof value === 'string' && rule.pattern && !rule.pattern.test(value)) {
      return false
    }

    return true
  }

  /**
   * 通知监听器
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static notifyWatchers(key: string, value: any): void {
    const watchers = this.watchers.get(key)
    if (watchers) {
      watchers.forEach(callback => {
        try {
          callback(value)
        } catch (error) {
          this.logger.error(`Config watcher error for key '${key}':`, error)
        }
      })
    }
  }
}

/**
 * 便捷函数
 */
export const getConfig = ConfigManager.get.bind(ConfigManager)
export const setConfig = ConfigManager.set.bind(ConfigManager)
export const watchConfig = ConfigManager.watch.bind(ConfigManager)
export const deleteConfig = ConfigManager.delete.bind(ConfigManager)
export const hasConfig = ConfigManager.has.bind(ConfigManager)