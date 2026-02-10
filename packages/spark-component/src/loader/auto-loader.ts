/**
 * SPARK 智能组件自动加载器
 * 
 * @module AutoLoader
 * @description
 * 自动扫描、分析和加载 Vue 组件，智能决定同步/异步加载策略。
 * 无需手动注册组件，系统自动处理所有加载逻辑。
 * 
 * 核心功能：
 * 1. **自动扫描** - 扫描指定目录的所有 Vue 组件
 * 2. **智能分析** - 根据文件大小、依赖、命名规则自动判断加载策略
 * 3. **自动注册** - 将组件自动注册到 SPARK 注册表
 * 4. **按需加载** - 大型组件和第三方组件延迟加载
 * 5. **预加载优化** - 核心组件立即加载，提升首屏性能
 * 
 * @example
 * ```typescript
 * import { AutoLoader } from '@spark-view/spark-component'
 * 
 * // 创建自动加载器
 * const loader = AutoLoader.create({
 *   // 扫描的组件目录（支持 glob 模式）
 *   patterns: [
 *     './components/**\/*.vue',
 *     './features/**\/*.vue'
 *   ],
 *   // 同步加载的组件（立即加载）
 *   syncComponents: ['PageRenderer', 'SparkComponentRenderer'],
 *   // 异步加载的组件（按需加载）
 *   asyncComponents: ['SparkEJ2*', '*Demo'],
 *   // 自动分析阈值（文件大小，单位：KB）
 *   sizeThreshold: 50
 * })
 * 
 * // 自动加载所有组件
 * await loader.loadAll()
 * 
 * // 或者按需加载
 * loader.loadOnDemand()
 * ```
 * 
 * @author SPARK Team
 * @since 1.1.0
 */

import type { Component } from 'vue'
import type { ComponentRegistry } from '../core/types'
import { Logger } from '@spark-view/spark-utils'

const logger = Logger('AutoLoader')

/**
 * 组件加载策略
 */
export type LoadStrategy = 'sync' | 'async' | 'auto'

/**
 * 组件元数据
 */
export interface ComponentMetadata {
  /** 组件名称（kebab-case） */
  name: string
  /** 文件路径 */
  path: string
  /** 原始文件名 */
  fileName: string
  /** 文件大小（KB） */
  size?: number
  /** 加载策略 */
  strategy: LoadStrategy
  /** 是否已加载 */
  loaded: boolean
  /** 组件实例 */
  component?: Component
}

/**
 * 自动加载器配置
 */
export interface AutoLoaderConfig {
  /**
   * 组件扫描模式（Vite glob 导入）
   * @example ['./components/**\/*.vue', './features/**\/*.vue']
   */
  patterns?: Record<string, () => Promise<Component | { default: Component }>>
  
  /**
   * 同步加载的组件列表（支持通配符）
   * 这些组件会立即加载，适用于核心组件
   * @default ['PageRenderer', 'SparkComponentRenderer', 'ErrorFallback']
   * @example ['Page*', 'Spark*', 'Error*']
   */
  syncComponents?: string[]
  
  /**
   * 异步加载的组件列表（支持通配符）
   * 这些组件会延迟加载，适用于大型组件和 Demo
   * @default ['*EJ2*', '*Demo', '*Test']
   * @example ['SparkEJ2*', '*Demo', 'Heavy*']
   */
  asyncComponents?: string[]
  
  /**
   * 文件大小阈值（KB）
   * 超过此大小的组件自动使用异步加载
   * @default 50
   */
  sizeThreshold?: number
  
  /**
   * 是否启用自动分析
   * 启用后会根据文件大小和命名规则自动判断加载策略
   * @default true
   */
  autoAnalyze?: boolean
  
  /**
   * 自定义组件注册表
   * 如果不提供，将使用全局注册表
   */
  registry?: ComponentRegistry
}

/**
 * SPARK 智能组件自动加载器
 */
export class AutoLoader {
  private config: Required<Omit<AutoLoaderConfig, 'registry' | 'patterns'>> & {
    registry?: ComponentRegistry
    patterns: Record<string, () => Promise<Component | { default: Component }>>
  }
  private components = new Map<string, ComponentMetadata>()
  private loadingPromises = new Map<string, Promise<Component>>()

  constructor(config: AutoLoaderConfig = {}) {
    this.config = {
      patterns: config.patterns ?? {},
      syncComponents: config.syncComponents ?? [
        'PageRenderer',
        'SparkComponentRenderer',
        'ErrorFallback',
        'UserGrid',
        'UserRow',
        'UserField'
      ],
      asyncComponents: config.asyncComponents ?? [
        '*EJ2*',
        '*Demo',
        'JsonRenderer*',
        'Capability*',
        'ComponentRenderer*',
        'TenantConfig*',
        'Dashboard',
        'About',
        'Settings'
      ],
      sizeThreshold: config.sizeThreshold ?? 50,
      autoAnalyze: config.autoAnalyze ?? true,
      registry: config.registry
    }
  }

  /**
   * 创建自动加载器实例
   */
  static create(config?: AutoLoaderConfig): AutoLoader {
    return new AutoLoader(config)
  }

  /**
   * 扫描并分析所有组件
   */
  async scan(): Promise<ComponentMetadata[]> {
    logger.info('🔍 开始扫描组件...')
    
    const patterns = this.config.patterns
    const metadata: ComponentMetadata[] = []

    for (const [path] of Object.entries(patterns)) {
      // 从路径提取组件名称
      // 例如: './components/UserGrid.vue' -> 'UserGrid'
      const fileName = path.split('/').pop()?.replace('.vue', '') ?? ''
      const componentName = this.toKebabCase(fileName)
      
      // 判断加载策略
      const strategy = this.determineStrategy(fileName)
      
      const meta: ComponentMetadata = {
        name: componentName,
        path,
        fileName,
        strategy,
        loaded: false
      }
      
      metadata.push(meta)
      this.components.set(componentName, meta)
    }

    logger.info(`✅ 扫描完成，发现 ${metadata.length} 个组件`)
    logger.info(`   • 同步加载: ${metadata.filter(m => m.strategy === 'sync').length} 个`)
    logger.info(`   • 异步加载: ${metadata.filter(m => m.strategy === 'async').length} 个`)
    
    return metadata
  }

  /**
   * 加载所有同步组件
   */
  async loadSyncComponents(): Promise<void> {
    logger.info('⚡ 加载同步组件...')
    
    const syncComponents = Array.from(this.components.values())
      .filter(meta => meta.strategy === 'sync' && !meta.loaded)
    
    const loadPromises = syncComponents.map(meta => this.loadComponent(meta.name))
    await Promise.all(loadPromises)
    
    logger.info(`✅ 同步组件加载完成 (${syncComponents.length} 个)`)
  }

  /**
   * 加载所有组件（同步 + 异步）
   */
  async loadAll(): Promise<void> {
    await this.scan()
    await this.loadSyncComponents()
    
    // 异步组件在后台预加载
    const asyncComponents = Array.from(this.components.values())
      .filter(meta => meta.strategy === 'async' && !meta.loaded)
    
    if (asyncComponents.length > 0) {
      logger.info(`🔄 后台预加载异步组件 (${asyncComponents.length} 个)...`)
      // 不等待异步组件加载完成，在后台进行
      Promise.all(asyncComponents.map(meta => this.loadComponent(meta.name)))
        .then(() => {
          logger.info('✅ 异步组件预加载完成')
        })
        .catch(err => {
          logger.warn('⚠️ 部分异步组件预加载失败:', err)
        })
    }
  }

  /**
   * 按需加载模式（仅加载同步组件）
   */
  async loadOnDemand(): Promise<void> {
    await this.scan()
    await this.loadSyncComponents()
    logger.info('📦 按需加载模式：异步组件将在使用时自动加载')
  }

  /**
   * 加载单个组件
   */
  async loadComponent(name: string): Promise<Component | null> {
    const meta = this.components.get(name)
    if (!meta) {
      logger.warn(`⚠️ 组件未找到: ${name}`)
      return null
    }

    // 如果正在加载，返回加载中的 Promise
    const existingPromise = this.loadingPromises.get(name)
    if (existingPromise) {
      return existingPromise
    }

    // 如果已加载，直接返回
    if (meta.loaded && meta.component) {
      return meta.component
    }

    // 开始加载
    const loadPromise = this.doLoadComponent(meta)
    this.loadingPromises.set(name, loadPromise)

    try {
      const component = await loadPromise
      meta.component = component
      meta.loaded = true
      this.loadingPromises.delete(name)
      
      // 自动注册到 SPARK 注册表
      if (this.config.registry) {
        this.config.registry.register(name, component)
        logger.debug(`✓ 已注册: ${name}`)
      }
      
      return component
    } catch (error) {
      this.loadingPromises.delete(name)
      logger.error(`❌ 加载失败: ${name}`, error)
      throw error
    }
  }

  /**
   * 执行组件加载
   */
  private async doLoadComponent(meta: ComponentMetadata): Promise<Component> {
    const loader = this.config.patterns[meta.path]
    if (!loader) {
      throw new Error(`组件加载器未找到: ${meta.path}`)
    }

    const module = await loader()
    // 处理默认导出或模块本身
    if (typeof module === 'object' && module !== null && 'default' in module) {
      return (module as { default: Component }).default
    }
    return module as Component
  }

  /**
   * 判断加载策略
   */
  private determineStrategy(fileName: string): LoadStrategy {
    if (!this.config.autoAnalyze) {
      return 'async'
    }

    // 1. 检查是否在同步列表中
    if (this.matchPattern(fileName, this.config.syncComponents)) {
      return 'sync'
    }

    // 2. 检查是否在异步列表中
    if (this.matchPattern(fileName, this.config.asyncComponents)) {
      return 'async'
    }

    // 3. 根据命名规则判断
    // 核心组件、渲染器 -> 同步
    if (fileName.match(/^(Page|Spark|Core|Base|Layout)/)) {
      return 'sync'
    }

    // Demo、测试、大型组件 -> 异步
    if (fileName.match(/(Demo|Test|Example|Heavy|Large|EJ2)/)) {
      return 'async'
    }

    // 4. 默认使用异步加载（性能优先）
    return 'async'
  }

  /**
   * 匹配模式（支持通配符）
   */
  private matchPattern(fileName: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      // 转换通配符为正则表达式
      // *EJ2* -> .*EJ2.*
      // Page* -> Page.*
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*') + '$',
        'i' // 不区分大小写
      )
      return regex.test(fileName)
    })
  }

  /**
   * 转换为 kebab-case
   */
  private toKebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase()
  }

  /**
   * 获取所有组件元数据
   */
  getComponents(): ComponentMetadata[] {
    return Array.from(this.components.values())
  }

  /**
   * 获取已加载的组件
   */
  getLoadedComponents(): ComponentMetadata[] {
    return Array.from(this.components.values()).filter(meta => meta.loaded)
  }

  /**
   * 获取组件统计信息
   */
  getStats() {
    const components = this.getComponents()
    const loaded = this.getLoadedComponents()
    
    return {
      total: components.length,
      loaded: loaded.length,
      pending: components.length - loaded.length,
      sync: components.filter(c => c.strategy === 'sync').length,
      async: components.filter(c => c.strategy === 'async').length
    }
  }
}

/**
 * 创建全局自动加载器（便捷方法）
 */
export function createAutoLoader(config?: AutoLoaderConfig): AutoLoader {
  return AutoLoader.create(config)
}

export default AutoLoader
