/**
 * 插件管理系统
 * @module @spark-view/spark-app/plugins
 * 
 * 提供统一的插件注册、配置和加载机制
 */

import type { Plugin } from 'vue'
import { createLogger } from '../logger'

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
 * 插件注册表
 * 
 * 管理插件名称到加载器的映射
 */
export class PluginRegistry {
  private static loaders = new Map<string, PluginLoader>()
  
  /**
   * 注册插件加载器
   */
  static register(id: string, loader: Omit<PluginLoader, 'id'>): void {
    if (this.loaders.has(id)) {
      console.warn(`[PluginRegistry] Plugin "${id}" already registered, will be overwritten`)
    }
    this.loaders.set(id, { id, ...loader })
  }
  
  /**
   * 批量注册插件加载器
   */
  static registerAll(loaders: Record<string, Omit<PluginLoader, 'id'>>): void {
    Object.entries(loaders).forEach(([id, loader]) => {
      this.register(id, loader)
    })
  }
  
  /**
   * 获取插件加载器
   */
  static get(id: string): PluginLoader | undefined {
    return this.loaders.get(id)
  }
  
  /**
   * 检查插件是否已注册
   */
  static has(id: string): boolean {
    return this.loaders.has(id)
  }
  
  /**
   * 获取所有已注册的插件
   */
  static getAll(): PluginLoader[] {
    return Array.from(this.loaders.values())
  }
  
  /**
   * 获取所有已注册的插件 ID
   */
  static getAllIds(): string[] {
    return Array.from(this.loaders.keys())
  }
  
  /**
   * 注销插件
   */
  static unregister(id: string): boolean {
    return this.loaders.delete(id)
  }
  
  /**
   * 清除所有注册
   */
  static clear(): void {
    this.loaders.clear()
  }
  
  /**
   * 获取注册表统计信息
   */
  static getStats() {
    return {
      total: this.loaders.size,
      plugins: Array.from(this.loaders.keys())
    }
  }
}

/**
 * 插件管理器 - 负责加载和管理插件生命周期
 */
export class PluginManager {
  /**
   * 根据配置加载插件
   * 
   * @param pluginConfigs - 插件配置对象
   * @returns 插件实例数组（按优先级排序）
   */
  static async loadPlugins(
    pluginConfigs: Record<string, PluginConfig>
  ): Promise<PluginInstance[]> {
    const plugins: PluginInstance[] = []
    
    // 1. 标准化配置并按优先级排序
    const normalizedConfigs = Object.entries(pluginConfigs)
      .map(([id, config]) => {
        const normalized = this.normalizeConfig(config)
        const loader = PluginRegistry.get(id)
        
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
        
        const module = await loader.loader()
        const plugin = module.default
        
        // 合并默认选项和用户选项
        const options = {
          ...loader.defaultOptions,
          ...config.options
        }
        
        plugins.push({
          plugin,
          options,
          loader
        })
        
        pluginLogger.info(`Plugin loaded: ${loader.name}`)
      } catch (error) {
        pluginLogger.error(`Failed to load plugin "${id}"`, error as Error)
      }
    }
    
    pluginLogger.info(`Successfully loaded ${plugins.length} plugins`)
    
    return plugins
  }
  
  /**
   * 加载单个插件
   */
  static async loadPlugin(
    id: string,
    config: PluginConfig = { enabled: true }
  ): Promise<PluginInstance | null> {
    const normalized = this.normalizeConfig(config)
    
    if (!normalized.enabled) {
      return null
    }
    
    const loader = PluginRegistry.get(id)
    if (!loader) {
      pluginLogger.warn(`Plugin "${id}" not registered`)
      return null
    }
    
    try {
      pluginLogger.info(`Loading plugin: ${loader.name}`)
      
      const module = await loader.loader()
      const plugin = module.default
      
      const options = {
        ...loader.defaultOptions,
        ...normalized.options
      }
      
      return { plugin, options, loader }
    } catch (error) {
      if (error instanceof Error) {
        pluginLogger.error(`Failed to load plugin "${id}":`, error)
      } else {
        pluginLogger.error(`Failed to load plugin "${id}": ${String(error)}`)
      }
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
export function createPluginRegister() {
  return {
    register: (id: string, loader: Omit<PluginLoader, 'id'>) => {
      PluginRegistry.register(id, loader)
    },
    registerAll: (loaders: Record<string, Omit<PluginLoader, 'id'>>) => {
      PluginRegistry.registerAll(loaders)
    }
  }
}
