import { componentRegistry as defaultRegistry } from './SparkComponentRegistry.js'
import { Logger } from '@spark-view/spark-utils'
import { capabilityManager } from '../capability/ComponentCapabilityManager.js'
import { SparkComponentRendererImpl } from './SparkComponentRenderer.js'
import type { ComponentConfig, ComponentContext, CapabilityProvider, CapabilityConsumer, ComponentRegistry, ComponentManager } from '../types/spark-component.js'

/**
 * SPARK 组件管理器实现
 * 
 * 核心职责：管理组件实例的生命周期
 * - 创建和销毁组件上下文（ComponentContext）
 * - 渲染组件树
 * - 管理组件间的能力系统（Capability）
 * - 维护组件实例注册表
 * 
 * 设计模式：单例 + 工厂
 * - 默认实例：componentManager（全局共享）
 * - 工厂函数：createComponentManager（按需创建）
 */
export class SparkComponentManagerImpl {
  /** 组件上下文实例缓存（key: contextId, value: ComponentContext） */
  private contexts = new Map<string, ComponentContext>()
  /** 组件渲染器（负责将配置转换为 VNode） */
  private renderer: SparkComponentRendererImpl
  /** 组件类型注册表（存储组件定义） */
  private registry: ComponentRegistry
  /** 日志记录器 */
  private logger = Logger('Spark:Manager')

  /**
   * 构造函数
   * @param renderer - 可选的自定义渲染器
   * @param registry - 可选的自定义注册表
   */
  constructor(renderer?: SparkComponentRendererImpl, registry?: ComponentRegistry) {
    this.registry = registry ?? defaultRegistry
    this.renderer = renderer ?? new SparkComponentRendererImpl(this.registry)
  }

  /**
   * 创建组件上下文
   * 
   * 组件上下文是组件实例的运行时表示，包含：
   * - 唯一 ID
   * - 组件类型和配置
   * - 父子关系
   * - 状态数据
   * - 能力提供者/消费者
   * 
   * @param config - 组件配置
   * @param parent - 父组件上下文（可选）
   * @returns 新创建的组件上下文
   */
  createContext(config: ComponentConfig, parent?: ComponentContext): ComponentContext {
    const ctx: ComponentContext = {
      id: config.id ?? this.generateId(),
      type: config.type,
      parent,
      children: [],
      config,
      state: {},
      providers: new Set<CapabilityProvider>(),
      consumers: new Map<string, CapabilityConsumer>()
    }
    if (parent) parent.children.push(ctx)
    this.contexts.set(ctx.id, ctx)
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
  render(config: ComponentConfig, parentContext?: ComponentContext): unknown {
    const ctx = this.createContext(config, parentContext)
    // Use the unified renderer for component tree rendering
    const renderResult = this.renderer.renderComponentTree(config)
    this.logger.info(`Rendered component tree: ${config.type} (${ctx.id})`)
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
      capabilityManager.disconnectAllCapabilities(ctx)
      if (ctx.parent) ctx.parent.children = ctx.parent.children.filter(c => c.id !== id)
      const walk = (c: ComponentContext) => {
        c.children.forEach(x => walk(x))
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
   */
  registerProvider(context: ComponentContext, provider: CapabilityProvider): void {
    context.providers.add(provider)
    try { capabilityManager.autoConnectCapabilities(context) } catch {}

    // notify any listeners waiting for a provider
    if (context.providerListeners?.has(provider.name)) {
      const set = context.providerListeners.get(provider.name) as Set<(prov: CapabilityProvider) => void>
      set.forEach(cb => {
        try { cb(provider) } catch (e: unknown) { this.logger.warn('provider listener threw', String(e)) }
      })
      set.clear()
    }
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
    const provider = Array.from(context.providers).find(p => p.name === capabilityName)
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
   * @param def - 组件配置定义
   */
  registerComponent(def: ComponentConfig) {
    this.registry.register(def.type, def)
  }

  /**
   * 批量注册组件类型定义
   * 
   * @param defs - 组件配置定义数组
   */
  registerComponents(defs: ComponentConfig[]) {
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
    return def.loader || def.component || null
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
 * - 避免重复创建管理器实例
 */
export const componentManager = new SparkComponentManagerImpl()

/**
 * 创建新的组件管理器实例
 * 
 * 使用场景：
 * - 需要隔离的组件系统（如测试、多租户）
 * - 自定义渲染器或注册表
 * 
 * @param renderer - 可选的自定义渲染器
 * @param registry - 可选的自定义注册表
 * @returns 新的组件管理器实例
 * 
 * @example
 * ```typescript
 * // 创建独立的测试管理器
 * const testManager = createComponentManager()
 * 
 * // 使用自定义注册表
 * const customRegistry = new SparkComponentRegistryImpl()
 * const manager = createComponentManager(undefined, customRegistry)
 * ```
 */
export function createComponentManager(renderer?: SparkComponentRendererImpl, registry?: ComponentRegistry): ComponentManager {
  return new SparkComponentManagerImpl(renderer, registry)
}

// NOTE: convenience helpers were removed to avoid duplicating the public namespace API.
// Use `Spark.manager()` or `componentManager` directly.