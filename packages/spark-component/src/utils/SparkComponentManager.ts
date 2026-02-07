/**
 * 📦 组件实例生命周期管理器
 * 
 * 管理每个组件实例从"出生"到"死亡"：
 * - 创建上下文（Context）→ 组件运行环境
 * - 渲染组件树 → VNode
 * - 连接能力系统 → Provider/Consumer
 * - 销毁上下文 → 清理资源
 * 
 * 不管组件注册（Registry）- 通过 getRegistry() 访问
 */
import { componentRegistry as defaultRegistry, createComponentRegistry } from './SparkComponentRegistry.js'
import { Logger } from '@spark-view/spark-utils'
import { capabilityManager as defaultCapabilityManager, createComponentCapabilityManager } from '../capability/ComponentCapabilityManager.js'
import { SparkComponentRendererImpl } from './SparkComponentRenderer.js'
import type { ComponentContext, CapabilityProvider, CapabilityConsumer, ComponentRegistry, ComponentManager } from '../types/spark-component.js'
import type { ComponentCapabilityManager } from '../capability/ComponentCapabilityManager.js'

/**
 * 🎯 组件实例管理器（负责实例的"生老病死"）
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
  // 📦 Context 生命周期：创建 → 查询 → 销毁
  // ============================================================================

  /** 创建组件上下文（组件实例的运行环境） */
  createContext(config: Partial<ComponentContext>, parent?: ComponentContext): ComponentContext {
    // 验证必需字段
    if (!config.type || typeof config.type !== 'string') {
      throw new Error('createContext requires a valid type (non-empty string)')
    }
    if (!this.registry.has(config.type)) {
      this.logger.warn(`Component type '${config.type}' not registered. Register it before rendering.`)
    }

    // 创建上下文
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

    // 建立父子关系
    if (parent) {
      parent.children ??= []
      parent.children.push(ctx)
    }

    // 缓存上下文
    this.contexts.set(ctx.id, ctx)
    this.logger.debug(`Context created: ${ctx.type} (${ctx.id})`)
    return ctx
  }

  /** 查询上下文 */
  getContext(id: string): ComponentContext | undefined {
    return this.contexts.get(id)
  }

  /** 获取所有上下文 */
  getAllContexts(): ComponentContext[] {
    return Array.from(this.contexts.values())
  }

  /** 注册上下文到管理器 */
  registerContext(context: ComponentContext): void {
    if (!this.contexts.has(context.id)) {
      this.contexts.set(context.id, context)
    }
  }

  /** 销毁上下文（递归：断开能力 → 移除父子关系 → 清理子组件 → 删除缓存） */
  destroyContext(id: string): boolean {
    const ctx = this.contexts.get(id)
    if (!ctx) return false

    try {
      // 1. 断开所有能力连接
      this.capabilityManager.disconnectAllCapabilities(ctx)

      // 2. 从父组件移除
      if (ctx.parent && 'children' in ctx.parent && Array.isArray(ctx.parent.children)) {
        ctx.parent.children = ctx.parent.children.filter((c: ComponentContext) => c.id !== id)
      }

      // 3. 递归销毁子组件
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
  // 🎨 组件渲染：配置 → VNode
  // ============================================================================

  /** 渲染组件树 */
  render(config: Partial<ComponentContext>, parentContext?: ComponentContext): unknown {
    const ctx = this.createContext(config, parentContext)
    const renderResult = this.renderer.renderComponentTree(ctx)
    this.logger.info(`Rendered: ${ctx.type} (${ctx.id})`)
    return renderResult
  }

  // ============================================================================
  // 🔌 能力系统：Provider ⇄ Consumer 连接
  // ============================================================================

  /** 获取能力管理器 */
  getCapabilityManager(): ComponentCapabilityManager {
    return this.capabilityManager
  }

  /** 注册能力提供者（自动连接 Consumer + 通知监听器） */
  registerProvider(context: ComponentContext, provider: CapabilityProvider): void {
    // 验证
    if (!provider?.name || typeof provider.name !== 'string') {
      throw new Error('Invalid provider: must have a non-empty name')
    }

    // 存储
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
          try { cb(provider) } 
          catch (e: unknown) { 
            this.logger.warn(`Listener for '${provider.name}' threw:`, String(e)) 
          }
        })
        set.clear()
      }
    }

    this.logger.debug(`Provider registered: '${provider.name}' in ${context.type} (${context.id})`)
  }

  /** 查找能力提供者（向上查找父级链直到找到） */
  getProvider(context: ComponentContext, capabilityName: string): CapabilityProvider | undefined {
    const provider = context.providers.get(capabilityName)
    if (provider) return provider
    if (context.parent) {
      return this.getProvider(context.parent as ComponentContext, capabilityName)
    }
    return undefined
  }

  // ============================================================================
  // 🔗 依赖访问器（不代理，只提供访问）
  // ============================================================================

  /** 获取组件注册表（使用：manager.getRegistry().register()） */
  getRegistry(): ComponentRegistry {
    return this.registry
  }

  // ============================================================================
  // 🛠️ 内部工具
  // ============================================================================

  /** 生成唯一 ID */
  private generateId(): string {
    return `spark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}

// ============================================================================
// 🏭 工厂函数：创建 Manager 实例
// ============================================================================

/**
 * 默认全局实例（单应用场景）
 * 
 * ⚠️ 测试请用 createComponentManager() 创建隔离实例
 */
export const componentManager = new SparkComponentManagerImpl()

/**
 * 创建 Manager 实例（测试/自定义场景）
 * 
 * @example
 * const testManager = createComponentManager(
 *   undefined, 
 *   createComponentRegistry(),
 *   createComponentCapabilityManager()
 * )
 */
export function createComponentManager(
  renderer?: SparkComponentRendererImpl, 
  registry?: ComponentRegistry,
  capabilityManager?: ComponentCapabilityManager
): ComponentManager {
  return new SparkComponentManagerImpl(renderer, registry, capabilityManager)
}

/**
 * 创建完整组件系统（Manager + Registry + Capabilities 配套）
 * 
 * 场景：测试隔离 / 多租户 / 沙箱
 * 
 * @example
 * const { manager, registry, capabilities } = createComponentSystem()
 * registry.register('my-component', definition)
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