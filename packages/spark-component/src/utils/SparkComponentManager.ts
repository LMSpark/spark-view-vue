import { componentRegistry as defaultRegistry, createComponentRegistry } from './SparkComponentRegistry.js'
import { Logger } from '@spark-view/spark-utils'
import { capabilityManager as defaultCapabilityManager, createComponentCapabilityManager } from '../capability/ComponentCapabilityManager.js'
import { SparkComponentRendererImpl } from './SparkComponentRenderer.js'
import type { ComponentDefinition, ComponentContext, CapabilityProvider, CapabilityConsumer, ComponentRegistry, ComponentManager } from '../types/spark-component.js'
import type { ComponentCapabilityManager } from '../capability/ComponentCapabilityManager.js'

/**
 * SPARK 组件管理器实现
 * 
 * 核心职责：管理组件实例的生命周期
 * - 创建和销毁组件上下文（ComponentContext）
 * - 渲染组件树
 * - 管理组件间的能力系统（Capability）
 * - 维护组件实例注册表
 * 
 * 设计模式：依赖注入 + 工厂
 * - 默认实例：componentManager（全局共享，用于向后兼容）
 * - 工厂函数：createComponentManager（按需创建，支持依赖注入）
 */
export class SparkComponentManagerImpl {
  /** 组件上下文实例缓存（key: contextId, value: ComponentContext） */
  private contexts = new Map<string, ComponentContext>()
  /** 组件渲染器（负责将配置转换为 VNode） */
  private renderer: SparkComponentRendererImpl
  /** 组件类型注册表（存储组件定义） */
  private registry: ComponentRegistry
  /** 能力管理器（负责组件间能力的连接与断开） */
  private capabilityManager: ComponentCapabilityManager
  /** 日志记录器 */
  private logger = Logger('Spark:Manager')

  /**
   * 构造函数
   * @param renderer - 可选的自定义渲染器
   * @param registry - 可选的自定义注册表
   * @param capabilityManager - 可选的自定义能力管理器
   */
  constructor(
    renderer?: SparkComponentRendererImpl, 
    registry?: ComponentRegistry,
    capabilityManager?: ComponentCapabilityManager
  ) {
    this.registry = registry ?? defaultRegistry
    this.capabilityManager = capabilityManager ?? defaultCapabilityManager
    this.renderer = renderer ?? new SparkComponentRendererImpl(this.registry)
  }

  /**
   * 创建组件上下文
   * 
   * ComponentContext 现在同时包含实例配置和运行时管理：
   * - 实例配置：type, props, children
   * - 运行时：id, state, providers, consumers
   * 
   * @param config - 组件配置（可以是 JSON 配置或部分配置）
   * @param parent - 父组件上下文（可选）
   * @returns 新创建的组件上下文
   * @throws 如果 type 为空或配置无效
   */
  createContext(config: Partial<ComponentContext>, parent?: ComponentContext): ComponentContext {
    // 验证必需字段
    if (!config.type || typeof config.type !== 'string') {
      throw new Error('createContext requires a valid type (non-empty string)')
    }

    // 验证 type 是否已注册（警告而非错误，允许动态注册）
    if (!this.registry.has(config.type)) {
      this.logger.warn(`Component type '${config.type}' is not registered. Ensure it's registered before rendering.`)
    }

    const ctx: ComponentContext = {
      // 实例标识
      id: config.id ?? this.generateId(),
      type: config.type,
      // 实例配置
      props: config.props,
      children: config.children ?? [],
      // 运行时管理
      parent,
      state: config.state ?? {},
      providers: new Map<string, CapabilityProvider>(),
      consumers: new Map<string, CapabilityConsumer>()
    }
    if (parent) {
      parent.children ??= []
      parent.children.push(ctx)
    }
    this.contexts.set(ctx.id, ctx)
    this.logger.debug(`Created context: ${ctx.type} (${ctx.id})`)
    return ctx
  }

  /**
   * 渲染组件树
   * 
   * 创建组件上下文并递归渲染整个组件树
   * 
   * @param config - 组件配置（可能包含子组件）
   * @param parentContext - 父组件上下文（可选）
   * @returns 渲染结果（VNode）
   */
  render(config: Partial<ComponentContext>, parentContext?: ComponentContext): unknown {
    const ctx = this.createContext(config, parentContext)
    // Use the unified renderer for component tree rendering
    const renderResult = this.renderer.renderComponentTree(ctx)
    this.logger.info(`Rendered component tree: ${ctx.type} (${ctx.id})`)
    return renderResult
  }

  /**
   * 获取组件上下文
   * 
   * @param id - 组件上下文 ID
   * @returns 组件上下文或 undefined
   */
  getContext(id: string): ComponentContext | undefined {
    return this.contexts.get(id)
  }

  /**
   * 获取能力管理器
   * 
   * 用于组件内部需要直接操作能力系统时（如 useSparkComponent, createSparkComponent）
   * 支持依赖注入架构，避免直接使用全局单例
   * 
   * @returns 当前管理器关联的能力管理器实例
   */
  getCapabilityManager(): ComponentCapabilityManager {
    return this.capabilityManager
  }

  /**
   * 销毁组件上下文
   * 
   * 递归销毁组件及其所有子组件：
   * 1. 断开所有能力连接
   * 2. 从父组件移除
   * 3. 递归销毁子组件
   * 4. 从缓存中删除
   * 
   * @param id - 组件上下文 ID
   * @returns 是否销毁成功
   */
  destroyContext(id: string): boolean {
    const ctx = this.contexts.get(id)
    if (!ctx) return false
    try {
      this.capabilityManager.disconnectAllCapabilities(ctx)
      ctx.parent?.children && (ctx.parent.children = ctx.parent.children.filter(c => c.id !== id))
      const walk = (c: ComponentContext) => {
        c.children?.forEach(x => walk(x))
        this.contexts.delete(c.id)
      }
      walk(ctx)
      this.contexts.delete(id)
      return true
    } catch (e) {
      this.logger.error('Failed to destroy context:', e)
      return false
    }
  }

  /**
   * 注册能力提供者到组件上下文
   * 
   * 注册后会自动尝试连接消费者，并通知等待的监听器
   * 
   * @param context - 组件上下文
   * @param provider - 能力提供者
   * @throws 如果 provider 无效
   */
  registerProvider(context: ComponentContext, provider: CapabilityProvider): void {
    // 验证 provider
    if (!provider?.name || typeof provider.name !== 'string') {
      throw new Error('Invalid provider: must have a non-empty name')
    }

    context.providers.set(provider.name, provider)
    
    // 自动连接能力（安全处理错误）
    try { 
      this.capabilityManager.autoConnectCapabilities(context) 
    } catch (e: unknown) {
      this.logger.warn(`Failed to auto-connect capabilities for ${context.type}:`, String(e))
    }

    // 通知等待的监听器
    if (context.providerListeners?.has(provider.name)) {
      const set = context.providerListeners.get(provider.name)
      if (set) {
        set.forEach(cb => {
          try { 
            cb(provider) 
          } catch (e: unknown) { 
            this.logger.warn(`Provider listener for '${provider.name}' threw error:`, String(e)) 
          }
        })
        set.clear()
      }
    }

    this.logger.debug(`Registered provider '${provider.name}' for ${context.type} (${context.id})`)
  }

  /**
   * 注册组件上下文到管理器
   * 
   * @param context - 组件上下文
   */
  registerContext(context: ComponentContext): void {
    if (!this.contexts.has(context.id)) this.contexts.set(context.id, context)
  }

  /**
   * 获取所有组件上下文
   * 
   * @returns 所有组件上下文数组
   */
  getAllContexts(): ComponentContext[] {
    return Array.from(this.contexts.values())
  }

  /**
   * 查找能力提供者
   * 
   * 从当前上下文开始向上查找，直到找到或到达根节点
   * 
   * @param context - 起始组件上下文
   * @param capabilityName - 能力名称
   * @returns 能力提供者或 undefined
   */
  getProvider(context: ComponentContext, capabilityName: string): CapabilityProvider | undefined {
    const provider = context.providers.get(capabilityName)
    if (provider) return provider
    if (context.parent) return this.getProvider(context.parent, capabilityName)
    return undefined
  }

  // ========================================
  // 组件类型注册相关方法（委托给 Registry）
  // ========================================

  /**
   * 注册单个组件类型定义
   * 
   * 注意：这是便捷方法，实际委托给 Registry
   * 
   * @param def - 组件定义（ComponentDefinition）
   */
  registerComponent(def: ComponentDefinition) {
    this.registry.register(def.type, def)
  }

  /**
   * 批量注册组件类型定义
   * 
   * @param defs - 组件定义数组
   */
  registerComponents(defs: ComponentDefinition[]) {
    defs.forEach(d => this.registerComponent(d))
  }

  /**
   * 获取组件类型定义
   * 
   * @param type - 组件类型名称（如 'spark-button'）
   * @returns 组件定义或 undefined
   */
  getComponentDefinition(type: string) {
    return this.registry.get(type)
  }

  /**
   * 解析组件（处理 loader/component）
   * 🎯 供 Vue 组件使用，自动处理懒加载
   * 
   * @param type - 组件类型名称
   * @returns loader 函数或 component
   */
  resolveComponent(type: string) {
    const def = this.registry.get(type)
    if (!def) return null
    return def.loader ?? def.component ?? null
  }

  /**
   * 检查组件类型是否已注册
   * 
   * @param type - 组件类型名称
   * @returns 是否已注册
   */
  isComponentRegistered(type: string) {
    return this.registry.has(type)
  }

  /**
   * 获取所有已注册的组件类型名称
   * 
   * @returns 组件类型名称数组
   */
  getRegisteredComponentTypes(): string[] {
    return this.registry.getAllTypes()
  }

  /**
   * 生成唯一的组件 ID
   * 
   * 格式：spark-{timestamp}-{random}
   * 
   * @returns 唯一 ID
   */
  private generateId(): string {
    return `spark-${Date.now()}-${Math.random().toString(36).substr(2,9)}`
  }
}

/**
 * 默认的全局组件管理器实例
 * 
 * 使用场景：
 * - 简单应用，全局共享一个管理器
 * - 向后兼容（与全局 capabilityManager 配合使用）
 * 
 * ⚠️ 不推荐在测试中使用。测试应使用 createComponentManager() 创建隔离实例
 */
export const componentManager = new SparkComponentManagerImpl()

/**
 * 创建新的组件管理器实例
 * 
 * 使用场景：
 * - 需要隔离的组件系统（如测试、多租户）
 * - 自定义渲染器、注册表或能力管理器
 * 
 * @param renderer - 可选的自定义渲染器
 * @param registry - 可选的自定义注册表
 * @param capabilityManager - 可选的自定义能力管理器
 * @returns 新的组件管理器实例
 * 
 * @example
 * ```typescript
 * // 创建独立的测试管理器（完全隔离）
 * const testManager = createComponentManager(
 *   undefined, 
 *   createComponentRegistry(),
 *   createComponentCapabilityManager()
 * )
 * 
 * // 使用默认能力管理器（与全局共享）
 * const manager = createComponentManager(undefined, createComponentRegistry())
 * ```
 */
export function createComponentManager(
  renderer?: SparkComponentRendererImpl, 
  registry?: ComponentRegistry,
  capabilityManager?: ComponentCapabilityManager
): ComponentManager {
  return new SparkComponentManagerImpl(renderer, registry, capabilityManager)
}

/**
 * 创建完全隔离的组件系统（Manager + Registry + CapabilityManager 配套）
 * 
 * 使用场景：
 * - 测试环境（每个测试用例独立的组件系统，状态完全隔离）
 * - 多租户应用（每个租户独立的组件库和能力系统）
 * - 沙箱环境（隔离的组件定义、实例和能力连接）
 * 
 * @returns 配套的 Manager、Registry 和 CapabilityManager
 * 
 * @example
 * ```typescript
 * // ✅ 推荐：测试场景（完全隔离）
 * const { manager, registry, capabilities } = Spark.createComponentSystem()
 * registry.register('test-component', definition)
 * 
 * // 多租户场景
 * const tenant1 = Spark.createComponentSystem()
 * const tenant2 = Spark.createComponentSystem()
 * // tenant1 和 tenant2 的状态完全独立
 * ```
 */
export function createComponentSystem(): { 
  manager: ComponentManager
  registry: ComponentRegistry
  capabilities: ComponentCapabilityManager 
} {
  const registry = createComponentRegistry()
  const capabilities = createComponentCapabilityManager()
  const manager = createComponentManager(undefined, registry, capabilities)
  return { manager, registry, capabilities }
}