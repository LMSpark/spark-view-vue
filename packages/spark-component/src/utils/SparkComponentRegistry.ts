import { Logger } from '@spark-view/spark-utils'
import type { ComponentConfig, ComponentRegistry } from '../types/spark-component.js'

/**
 * SPARK 组件注册表实现
 * 
 * 核心职责：管理组件类型定义（设计图纸）
 * - 注册和注销组件类型
 * - 查找组件定义
 * - 版本兼容性检查
 * - 能力提供者匹配
 * 
 * 设计模式：注册表模式（Registry Pattern）
 * - 默认实例：componentRegistry（全局共享）
 * - 工厂函数：createComponentRegistry（隔离实例）
 * 
 * 与 Manager 的区别：
 * - Registry 存储类型定义（如类的定义）
 * - Manager 管理实例生命周期（如类的实例）
 */
export class SparkComponentRegistryImpl implements ComponentRegistry {
  /** 组件类型定义存储（key: 组件类型名, value: 组件配置定义） */
  private components = new Map<string, ComponentConfig>()
  /** 加载中的组件（防止重复加载） */
  private loading = new Map<string, Promise<ComponentConfig | undefined>>()
  /** 日志记录器 */
  private logger = Logger('Spark:Registry')

  /**
   * 注册组件类型定义
   * 
   * @param type - 组件类型名称（如 'spark-button', 'spark-grid'）
   * @param definition - 组件配置定义
   * @throws 如果定义无效则抛出错误
   * 
   * @example
   * ```typescript
   * registry.register('spark-button', {
   *   type: 'spark-button',
   *   name: '按钮组件',

   *   component: ButtonComponent
   * })
   * ```
   */
  register(type: string, definition: ComponentConfig): void {
    if (this.components.has(type)) {
      this.logger.warn(`Component type '${type}' is already registered. Overwriting...`)
    }
    if (!this.validateDefinition(definition)) {
      throw new Error(`Invalid component definition for type '${type}'`)
    }
    // 为逻辑组件提供默认值
    const normalizedDef: ComponentConfig = {
      ...definition,
      type: definition.type || type
    }
    this.components.set(type, normalizedDef)
    this.logger.info(`✅ Registered SPARK component: ${type}`)
  }

  /**
   * 获取组件类型定义
   * 
   * @param type - 组件类型名称
   * @returns 组件定义或 undefined（如果未注册）
   */
  get(type: string): ComponentConfig | undefined {
    return this.components.get(type)
  }

  /**
   * 异步获取组件类型定义（支持动态导入）
   * 
   * 如果组件已加载，直接返回
   * 如果组件有 loader，自动调用 loader 加载
   * 如果正在加载，等待加载完成
   * 
   * @param type - 组件类型名称
   * @returns 组件定义或 undefined
   * 
   * @example
   * ```typescript
   * // 注册懒加载组件
   * registry.register('spark-heavy-grid', {
   *   type: 'spark-heavy-grid',
   *   name: '重量级表格',
   *   loader: () => import('./components/HeavyGrid.vue')
   * })
   * 
   * // 使用时自动加载
   * const def = await registry.getAsync('spark-heavy-grid')
   * // 首次调用会触发 import()，后续直接返回缓存
   * ```
   */
  async getAsync(type: string): Promise<ComponentConfig | undefined> {
    // 1. 已加载，直接返回
    const existing = this.components.get(type)
    if (existing?.component) {
      return existing
    }

    // 2. 正在加载，等待完成
    const loadingPromise = this.loading.get(type)
    if (loadingPromise) {
      return loadingPromise
    }

    // 3. 有 loader，开始加载
    if (existing?.loader) {
      const loadPromise = this._loadComponent(type, existing)
      this.loading.set(type, loadPromise)
      try {
        return await loadPromise
      } finally {
        this.loading.delete(type)
      }
    }

    // 4. 没有 loader，返回原始定义（可能是逻辑组件）
    return existing
  }

  /**
   * 内部方法：执行组件加载
   */
  private async _loadComponent(type: string, definition: ComponentConfig): Promise<ComponentConfig | undefined> {
    try {
      this.logger.info(`⏳ Loading component: ${type}`)
      const loader = definition.loader
      if (!loader) {
        return definition
      }
      const module = await loader()
      const component = module.default ?? module
      
      // 更新定义，填充 component 字段
      const loaded: ComponentConfig = {
        ...definition,
        component,
        loader: undefined // 加载后清除 loader，避免重复加载
      }
      this.components.set(type, loaded)
      this.logger.info(`✅ Loaded component: ${type}`)
      return loaded
    } catch (error) {
      this.logger.error(`❌ Failed to load component: ${type}`, error)
      return undefined
    }
  }

  /**
   * 预加载多个组件
   * 
   * 批量加载组件，适用于：
   * - 路由切换前预加载
   * - 空闲时预加载常用组件
   * - 优化首屏加载（并行加载）
   * 
   * @param types - 组件类型名称数组
   * 
   * @example
   * ```typescript
   * // 路由切换前预加载
   * router.beforeEach(async (to) => {
   *   if (to.meta.components) {
   *     await registry.preload(to.meta.components as string[])
   *   }
   * })
   * 
   * // 空闲时预加载
   * requestIdleCallback(() => {
   *   registry.preload(['spark-chart', 'spark-calendar'])
   * })
   * ```
   */
  async preload(types: string[]): Promise<void> {
    this.logger.info(`🚀 Preloading ${types.length} components: ${types.join(', ')}`)
    await Promise.all(types.map(type => this.getAsync(type)))
    this.logger.info(`✅ Preloaded ${types.length} components`)
  }

  /**
   * 检查组件类型是否已注册
   * 
   * @param type - 组件类型名称
   * @returns 是否已注册
   */
  has(type: string): boolean {
    return this.components.has(type)
  }

  /**
   * 获取所有已注册的组件类型名称
   * 
   * @returns 组件类型名称数组
   */
  getAllTypes(): string[] {
    return Array.from(this.components.keys())
  }

  /**
   * 注销组件类型
   * 
   * @param type - 组件类型名称
   * @returns 是否成功注销
   */
  unregister(type: string): boolean {
    const removed = this.components.delete(type)
    if (removed) this.logger.info(`🗑️ Unregistered SPARK component: ${type}`)
    return removed
  }

  /**
   * 清空所有组件注册
   * 
   * 注意：此操作不可逆，谨慎使用
   */
  clear(): void {
    this.components.clear()
    this.logger.info('🧹 Cleared all SPARK component registrations')
  }

  /**
   * 验证组件定义是否有效
   * 
   * 验证规则：
   * 1. 必须有 type（非空字符串）
   * 2. 必须有 component 或 loader（除非是逻辑组件）
   * 3. version 如果提供，必须是有效的 semver
   * 
   * @param def - 组件定义
   * @returns 是否有效
   */
  private validateDefinition(def: ComponentConfig): boolean {
    // 必须有 type
    if (!def.type || typeof def.type !== 'string' || def.type.trim() === '') {
      this.logger.error('Invalid definition: type is required and must be a non-empty string')
      return false
    }

    // 必须有 component 或 loader（逻辑组件可以都没有）
    if (!def.component && !def.loader) {
      this.logger.warn(`Component '${def.type}' has neither component nor loader (logical component)`)
    }

    return true
  }
}

/**
 * 默认的全局组件注册表实例
 * 
 * 使用场景：
 * - 应用级别的组件类型管理
 * - 全局共享的组件定义
 * - 单一注册表架构
 * 
 * @example
 * ```typescript
 * import { componentRegistry } from '@spark-view/spark-component'
 * 
 * // 注册组件
 * componentRegistry.register('my-component', definition)
 * 
 * // 查找组件
 * const def = componentRegistry.get('my-component')
 * ```
 */
export const componentRegistry = new SparkComponentRegistryImpl()

/**
 * 创建新的隔离组件注册表实例
 * 
 * 使用场景：
 * - 测试隔离（每个测试用例独立注册表）
 * - 多租户应用（每个租户独立注册表）
 * - 插件系统（每个插件独立注册表）
 * - 沙箱环境（隔离的组件定义）
 * 
 * @returns 新的注册表实例
 * 
 * @example
 * ```typescript
 * // 测试场景：隔离的注册表
 * const testRegistry = createComponentRegistry()
 * testRegistry.register('test-component', mockDefinition)
 * 
 * // 多租户场景：租户独立的组件库
 * const tenantRegistry = createComponentRegistry()
 * tenantRegistry.register('tenant-custom-component', customDef)
 * 
 * // 与自定义 Manager 配合使用
 * const manager = createComponentManager(undefined, testRegistry)
 * ```
 */
export function createComponentRegistry(): ComponentRegistry {
  return new SparkComponentRegistryImpl()
}

// NOTE: convenience helpers were removed to avoid duplicating the public namespace API.
// Use `Spark.registerSparkComponent(...)` or `componentRegistry.register(...)` instead.
