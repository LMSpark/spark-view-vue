import { componentRegistry as defaultRegistry, createComponentRegistry } from './SparkComponentRegistry.js'
import { Logger } from '@spark-view/spark-utils'
import { capabilityManager as defaultCapabilityManager, createComponentCapabilityManager } from '../capability/ComponentCapabilityManager.js'
import { SparkComponentRendererImpl } from './SparkComponentRenderer.js'
import type { ComponentDefinition, ComponentContext, CapabilityProvider, CapabilityConsumer, ComponentRegistry, ComponentManager } from '../types/spark-component.js'
import type { ComponentCapabilityManager } from '../capability/ComponentCapabilityManager.js'

/**
 * SPARK 组件管理器
 * 
 * 核心职责：组件实例的生命周期管理
 * - 上下文（Context）创建、销毁、查询
 * - 组件树渲染
 * - 能力系统集成
 * - 组件注册表代理
 * 
 * 设计模式：默认实例 + 工厂函数
 * - 默认全局实例：componentManager（单应用场景）
 * - 工厂函数：createComponentManager / createComponentSystem（测试、多租户）
 */
export class SparkComponentManagerImpl {
  private readonly contexts = new Map<string, ComponentContext>()
  private readonly renderer: SparkComponentRendererImpl
  private readonly registry: ComponentRegistry
  private readonly capabilityManager: ComponentCapabilityManager
  private readonly logger = Logger('Spark:Manager')

  constructor(
    renderer?: SparkComponentRendererImpl, 
    registry?: ComponentRegistry,
    capabilityManager?: ComponentCapabilityManager
  ) {
    this.registry = registry ?? defaultRegistry
    this.capabilityManager = capabilityManager ?? defaultCapabilityManager
    this.renderer = renderer ?? new SparkComponentRendererImpl(this.registry)
  }

  // ============================================================================
  // 上下文生命周期管理
  // ============================================================================

  /**
   * 创建组件上下文
   * 
   * @param config - 组件配置（必需 type 字段）
   * @param parent - 父组件上下文
   * @throws 如果 type 无效
   */
  createContext(config: Partial<ComponentContext>, parent?: ComponentContext): ComponentContext {
    if (!config.type || typeof config.type !== 'string') {
      throw new Error('createContext requires a valid type (non-empty string)')
    }

    if (!this.registry.has(config.type)) {
      this.logger.warn(`Component type '${config.type}' not registered. Register it before rendering.`)
    }

    const ctx: ComponentContext = {
      id: config.id ?? this.generateId(),
      type: config.type,
      props: config.props,
      children: config.children ?? [],
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
    this.logger.debug(`Context created: ${ctx.type} (${ctx.id})`)
    return ctx
  }

  /**
   * 获取组件上下文
   */
  getContext(id: string): ComponentContext | undefined {
    return this.contexts.get(id)
  }

  /**
   * 获取所有组件上下文
   */
  getAllContexts(): ComponentContext[] {
    return Array.from(this.contexts.values())
  }

  /**
   * 注册组件上下文（供已创建的上下文加入管理）
   */
  registerContext(context: ComponentContext): void {
    if (!this.contexts.has(context.id)) {
      this.contexts.set(context.id, context)
    }
  }

  /**
   * 销毁组件上下文
   * 
   * 递归销毁流程：
   * 1. 断开所有能力连接
   * 2. 从父组件移除
   * 3. 递归销毁子组件
   * 4. 从缓存中删除
   */
  destroyContext(id: string): boolean {
    const ctx = this.contexts.get(id)
    if (!ctx) return false

    try {
      this.capabilityManager.disconnectAllCapabilities(ctx)

      if (ctx.parent && 'children' in ctx.parent && Array.isArray(ctx.parent.children)) {
        ctx.parent.children = ctx.parent.children.filter((c: ComponentContext) => c.id !== id)
      }

      const walk = (c: ComponentContext) => {
        c.children?.forEach(x => walk(x))
        this.contexts.delete(c.id)
      }
      walk(ctx)
      
      this.logger.debug(`Context destroyed: ${ctx.type} (${id})`)
      return true
    } catch (e) {
      this.logger.error('Failed to destroy context:', e)
      return false
    }
  }

  // ============================================================================
  // 组件渲染
  // ============================================================================

  /**
   * 渲染组件树
   * 
   * @param config - 组件配置
   * @param parentContext - 父组件上下文
   * @returns VNode 渲染结果
   */
  render(config: Partial<ComponentContext>, parentContext?: ComponentContext): unknown {
    const ctx = this.createContext(config, parentContext)
    const renderResult = this.renderer.renderComponentTree(ctx)
    this.logger.info(`Rendered: ${ctx.type} (${ctx.id})`)
    return renderResult
  }

  // ============================================================================
  // 能力系统集成
  // ============================================================================

  /**
   * 获取能力管理器
   */
  getCapabilityManager(): ComponentCapabilityManager {
    return this.capabilityManager
  }

  /**
   * 注册能力提供者
   * 
   * 自动执行：
   * - 能力连接（autoConnect）
   * - 通知等待的监听器
   * 
   * @throws 如果 provider 无效
   */
  registerProvider(context: ComponentContext, provider: CapabilityProvider): void {
    if (!provider?.name || typeof provider.name !== 'string') {
      throw new Error('Invalid provider: must have a non-empty name')
    }

    context.providers.set(provider.name, provider)
    
    // 自动连接能力
    try { 
      this.capabilityManager.autoConnectCapabilities(context) 
    } catch (e: unknown) {
      this.logger.warn(`Auto-connect failed for ${context.type}:`, String(e))
    }

    // 通知等待的监听器
    if (context.providerListeners?.has(provider.name)) {
      const set = context.providerListeners.get(provider.name)
      if (set) {
        set.forEach(cb => {
          try { 
            cb(provider) 
          } catch (e: unknown) { 
            this.logger.warn(`Listener for '${provider.name}' threw:`, String(e)) 
          }
        })
        set.clear()
      }
    }

    this.logger.debug(`Provider registered: '${provider.name}' in ${context.type} (${context.id})`)
  }

  /**
   * 查找能力提供者（向上查找父级链）
   * 
   * @param context - 起始组件上下文
   * @param capabilityName - 能力名称
   * @returns 能力提供者或 undefined
   */
  getProvider(context: ComponentContext, capabilityName: string): CapabilityProvider | undefined {
    const provider = context.providers.get(capabilityName)
    if (provider) return provider
    if (context.parent) {
      return this.getProvider(context.parent as ComponentContext, capabilityName)
    }
    return undefined
  }

  // ============================================================================
  // 组件注册表代理（委托给 Registry）
  // ============================================================================

  /**
   * 注册组件类型定义
   */
  registerComponent(def: ComponentDefinition): void {
    this.registry.register(def.type, def)
  }

  /**
   * 批量注册组件类型定义
   */
  registerComponents(defs: ComponentDefinition[]): void {
    defs.forEach(d => this.registerComponent(d))
  }

  /**
   * 获取组件类型定义
   */
  getComponentDefinition(type: string): ComponentDefinition | undefined {
    return this.registry.get(type)
  }

  /**
   * 解析组件（处理 loader/component，供 Vue 使用）
   */
  resolveComponent(type: string): unknown {
    const def = this.registry.get(type)
    if (!def) return null
    return def.loader ?? def.component ?? null
  }

  /**
   * 检查组件类型是否已注册
   */
  isComponentRegistered(type: string): boolean {
    return this.registry.has(type)
  }

  /**
   * 获取所有已注册的组件类型
   */
  getRegisteredComponentTypes(): string[] {
    return this.registry.getAllTypes()
  }

  // ============================================================================
  // 私有工具方法
  // ============================================================================

  /**
   * 生成唯一组件 ID
   */
  private generateId(): string {
    return `spark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}

// ============================================================================
// 默认实例 + 工厂函数（避免单例模式，支持一应用一实例）
// ============================================================================

/**
 * 默认的全局组件管理器
 * 
 * 使用场景：
 * - 单一应用系统（一应用一实例）
 * - 向后兼容
 * 
 * ⚠️ 测试请使用 createComponentManager() 创建隔离实例
 */
export const componentManager = new SparkComponentManagerImpl()

/**
 * 创建组件管理器实例
 * 
 * 使用场景：
 * - 测试隔离
 * - 自定义渲染器/注册表/能力管理器
 * 
 * @example
 * ```ts
 * // 测试用独立实例
 * const testManager = createComponentManager(
 *   undefined, 
 *   createComponentRegistry(),
 *   createComponentCapabilityManager()
 * )
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
 * - 测试环境（状态完全隔离）
 * - 多租户应用（每租户独立组件库）
 * - 沙箱环境
 * 
 * @example
 * ```ts
 * // 测试场景
 * const { manager, registry, capabilities } = createComponentSystem()
 * registry.register('test-component', definition)
 * 
 * // 多租户场景
 * const tenant1 = createComponentSystem()
 * const tenant2 = createComponentSystem()
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