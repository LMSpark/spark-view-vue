/**
 * 插件管理系统
 * @module @spark-view/spark-app/plugins
 * 
 * 提供统一的插件注册、配置和加载机制
 */

import type { Plugin } from 'vue'
import { createLogger } from '../logger'
import { toError } from '@spark-view/spark-utils'

const pluginLogger = createLogger('plugins')

/**
 * 插件配置项
 */
export interface PluginConfigItem {
  /** 是否启用 */
  enabled: boolean
  /** 插件选项 */
  options?: Record<string, unknown>
  /** 是否懒加载 */
  lazy?: boolean
  /** 优先级（数字越小越先加载） */
  priority?: number
}

/**
 * 插件配置类型（支持简单布尔值或详细配置）
 */
export type PluginConfig = boolean | PluginConfigItem

/**
 * 插件加载器定义
 */
export interface PluginLoader {
  /** 插件 ID */
  id: string
  /** 插件名称 */
  name: string
  /** 模块路径或包名 */
  module: string
  /** 动态导入函数 */
  loader: () => Promise<{ default: Plugin }>
  /** 默认配置 */
  defaultOptions?: Record<string, unknown>
  /** 插件描述 */
  description?: string
  /** 插件版本 */
  version?: string
}

/**
 * 插件实例（加载后的结果）
 */
export interface PluginInstance {
  /** 插件对象 */
  plugin: Plugin
  /** 插件选项 */
  options?: Record<string, unknown>
  /** 加载器信息 */
  loader: PluginLoader
}

/**
 * 插件注册表接口
 */
export interface IPluginRegistry {
  register(id: string, loader: Omit<PluginLoader, 'id'>): void
  registerAll(loaders: Record<string, Omit<PluginLoader, 'id'>>): void
  get(id: string): PluginLoader | undefined
  has(id: string): boolean
  getAll(): PluginLoader[]
  getAllIds(): string[]
  unregister(id: string): boolean
  clear(): void
  getStats(): { total: number; plugins: string[] }
}

/**
 * 创建隔离的插件注册表实例（测试 / 微前端场景）
 */
export function createPluginRegistry(): IPluginRegistry {
  const loaders = new Map<string, PluginLoader>()
  return {
    register(id: string, loader: Omit<PluginLoader, 'id'>): void {
      if (loaders.has(id)) {
        pluginLogger.warn(`Plugin "${id}" already registered, will be overwritten`)
      }
      loaders.set(id, { id, ...loader })
    },
    registerAll(entries: Record<string, Omit<PluginLoader, 'id'>>): void {
      for (const [id, loader] of Object.entries(entries)) {
        this.register(id, loader)
      }
    },
    get(id: string): PluginLoader | undefined {
      return loaders.get(id)
    },
    has(id: string): boolean {
      return loaders.has(id)
    },
    getAll(): PluginLoader[] {
      return Array.from(loaders.values())
    },
    getAllIds(): string[] {
      return Array.from(loaders.keys())
    },
    unregister(id: string): boolean {
      return loaders.delete(id)
    },
    clear(): void {
      loaders.clear()
    },
    getStats() {
      return { total: loaders.size, plugins: Array.from(loaders.keys()) }
    }
  }
}

/** 全局插件注册表单例（惰性创建） */
let _globalPluginRegistry: IPluginRegistry | undefined

/** 获取全局插件注册表单例 */
export function getGlobalPluginRegistry(): IPluginRegistry {
  _globalPluginRegistry ??= createPluginRegistry()
  return _globalPluginRegistry
}

/**
 * 插件注册表（静态门面 — 向后兼容）
 *
 * 内部委托给全局 {@link IPluginRegistry} 实例。
 * 新代码建议直接使用 `createPluginRegistry()` 或 `getGlobalPluginRegistry()`。
 *
 * @deprecated 优先使用 `getGlobalPluginRegistry()` 或 `createPluginRegistry()`
 */
export class PluginRegistry {
  /** @deprecated 使用 getGlobalPluginRegistry().register() */
  static register(id: string, loader: Omit<PluginLoader, 'id'>): void {
    getGlobalPluginRegistry().register(id, loader)
  }
  /** @deprecated 使用 getGlobalPluginRegistry().registerAll() */
  static registerAll(loaders: Record<string, Omit<PluginLoader, 'id'>>): void {
    getGlobalPluginRegistry().registerAll(loaders)
  }
  /** @deprecated 使用 getGlobalPluginRegistry().get() */
  static get(id: string): PluginLoader | undefined {
    return getGlobalPluginRegistry().get(id)
  }
  /** @deprecated 使用 getGlobalPluginRegistry().has() */
  static has(id: string): boolean {
    return getGlobalPluginRegistry().has(id)
  }
  /** @deprecated 使用 getGlobalPluginRegistry().getAll() */
  static getAll(): PluginLoader[] {
    return getGlobalPluginRegistry().getAll()
  }
  /** @deprecated 使用 getGlobalPluginRegistry().getAllIds() */
  static getAllIds(): string[] {
    return getGlobalPluginRegistry().getAllIds()
  }
  /** @deprecated 使用 getGlobalPluginRegistry().unregister() */
  static unregister(id: string): boolean {
    return getGlobalPluginRegistry().unregister(id)
  }
  /** @deprecated 使用 getGlobalPluginRegistry().clear() */
  static clear(): void {
    getGlobalPluginRegistry().clear()
  }
  /** @deprecated 使用 getGlobalPluginRegistry().getStats() */
  static getStats() {
    return getGlobalPluginRegistry().getStats()
  }
}

/**
 * 插件管理器 - 负责加载和管理插件生命周期
 */
export class PluginManager {
  /**
   * 从加载器构建插件实例（loadPlugins / loadPlugin 共用）
   */
  private static async createInstance(
    loader: PluginLoader,
    configOptions?: Record<string, unknown>
  ): Promise<PluginInstance> {
    const module = await loader.loader()
    return {
      plugin: module.default,
      options: { ...loader.defaultOptions, ...configOptions },
      loader
    }
  }

  /**
   * 根据配置加载插件
   * 
   * @param pluginConfigs - 插件配置对象
   * @param registry - 可选的插件注册表实例（默认使用全局注册表）
   * @returns 插件实例数组（按优先级排序）
   */
  static async loadPlugins(
    pluginConfigs: Record<string, PluginConfig>,
    registry: IPluginRegistry = getGlobalPluginRegistry()
  ): Promise<PluginInstance[]> {
    const plugins: PluginInstance[] = []
    
    // 1. 标准化配置并按优先级排序
    const normalizedConfigs = Object.entries(pluginConfigs)
      .map(([id, config]) => {
        const normalized = this.normalizeConfig(config)
        const loader = registry.get(id)
        
        return {
          id,
          config: normalized,
          loader,
          priority: normalized.priority ?? 100
        }
      })
      .filter(item => item.config.enabled && item.loader)
      .sort((a, b) => a.priority - b.priority)
    
    // 2. 并行加载插件（按优先级分批）
    pluginLogger.info(`Loading ${normalizedConfigs.length} plugins...`)
    
    for (const { id, config, loader } of normalizedConfigs) {
      if (!loader) continue
      
      try {
        pluginLogger.info(`Loading plugin: ${loader.name} (${id})`)
        
        const instance = await PluginManager.createInstance(loader, config.options)
        plugins.push(instance)
        
        pluginLogger.info(`Plugin loaded: ${loader.name}`)
      } catch (error) {
        pluginLogger.error(`Failed to load plugin "${id}"`, toError(error))
      }
    }
    
    pluginLogger.info(`Successfully loaded ${plugins.length} plugins`)
    
    return plugins
  }
  
  /**
   * 加载单个插件
   *
   * @param id - 插件 ID
   * @param config - 插件配置
   * @param registry - 可选的插件注册表实例（默认使用全局注册表）
   */
  static async loadPlugin(
    id: string,
    config: PluginConfig = { enabled: true },
    registry: IPluginRegistry = getGlobalPluginRegistry()
  ): Promise<PluginInstance | null> {
    const normalized = this.normalizeConfig(config)
    
    if (!normalized.enabled) {
      return null
    }
    
    const loader = registry.get(id)
    if (!loader) {
      pluginLogger.warn(`Plugin "${id}" not registered`)
      return null
    }
    
    try {
      pluginLogger.info(`Loading plugin: ${loader.name}`)
      return await PluginManager.createInstance(loader, normalized.options)
    } catch (error) {
      pluginLogger.error(`Failed to load plugin "${id}"`, toError(error))
      return null
    }
  }
  
  /**
   * 标准化插件配置
   */
  private static normalizeConfig(config: PluginConfig): PluginConfigItem {
    if (typeof config === 'boolean') {
      return { enabled: config }
    }
    return config
  }
}

/**
 * 便捷函数：创建插件注册器
 * 
 * @param registry - 可选的插件注册表实例（默认使用全局注册表）
 *
 * @example
 * ```typescript
 * const register = createPluginRegister()
 * register('my-plugin', {
 *   name: 'My Plugin',
 *   module: './plugins/my-plugin',
 *   loader: () => import('./plugins/my-plugin')
 * })
 * ```
 */
export function createPluginRegister(registry: IPluginRegistry = getGlobalPluginRegistry()) {
  return {
    register: (id: string, loader: Omit<PluginLoader, 'id'>) => {
      registry.register(id, loader)
    },
    registerAll: (loaders: Record<string, Omit<PluginLoader, 'id'>>) => {
      registry.registerAll(loaders)
    }
  }
}
