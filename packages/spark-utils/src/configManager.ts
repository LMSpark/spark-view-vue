/**
 * 配置管理器
 * 
 * @description 提供全局配置存储、访问和监听功能
 */
import { Logger } from './logger.js'

let config: Record<string, unknown> = {}
const watchers = new Map<string, Set<(v: unknown) => void>>()

/**
 * 设置配置项
 * 
 * @param newConfig - 新配置对象
 */
export function setConfig(newConfig: Record<string, unknown>) { config = { ...config, ...newConfig }; Logger().info('Config set', newConfig); Object.entries(newConfig).forEach(([k, v]) => { watchers.get(k)?.forEach(cb => cb(v)) }) }

/**
 * 获取配置项
 * 
 * @template T - 配置值类型
 * @param key - 配置键名
 * @param defaultValue - 默认值
 * @returns 配置值
 */
export function getConfig<T = unknown>(key: string, defaultValue?: T): T
export function getConfig<T = unknown>(key?: string, defaultValue?: T): unknown {
  if (!key) return config
  return (config[key] ?? defaultValue) as unknown
}

/**
 * 清空所有配置
 */
export function clearConfig() { config = {}; Logger().info('Config cleared'); watchers.clear() }

/**
 * 配置管理器类
 * 
 * @description 提供面向对象的配置管理接口
 */
export class ConfigManager {
  /**
   * 获取配置项
   * 
   * @template T - 配置值类型
   * @param key - 配置键名
   * @param defaultValue - 默认值
   * @returns 配置值
   */
  get<T = unknown>(key: string, defaultValue?: T): T | undefined { return getConfig<T>(key, defaultValue) }
  
  /**
   * 设置配置项
   * 
   * @template T - 配置值类型
   * @param key - 配置键名
   * @param value - 配置值
   */
  set<T = unknown>(key: string, value: T): void { const old = config[key]; config[key] = value; Logger().info(`Config updated: ${key}`); if (old !== value) { watchers.get(key)?.forEach(cb => cb(value)) } }
  
  /**
   * 删除配置项
   * 
   * @param key - 配置键名
   */
  delete(key: string): void { const had = config[key] !== undefined; delete config[key]; if (had) { watchers.get(key)?.forEach(cb => cb(undefined)) } }
  
  /**
   * 监听配置项变化
   * 
   * @param key - 配置键名
   * @param cb - 变化回调函数
   * @returns 取消监听函数
   */
  watch(key: string, cb: (value: unknown) => void): () => void { if (!watchers.has(key)) watchers.set(key, new Set()); watchers.get(key)?.add(cb); return () => { watchers.get(key)?.delete(cb) } }
  
  /**
   * 批量设置配置项
   * 
   * @param obj - 配置对象
   */
  setMultiple(obj: Record<string, unknown>): void { setConfig(obj) }
  
  /**
   * 获取所有配置
   * 
   * @returns 配置对象副本
   */
  getAll(): Record<string, unknown> { return { ...config } }
  
  /**
   * 重置所有配置
   */
  reset(): void { clearConfig() }
}
