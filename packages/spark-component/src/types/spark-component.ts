import type { CapabilityProvider, CapabilityConsumer, LoggerApi, CapabilityContext } from './common.js'

export namespace Spark {
  /**
   * 组件定义 - 注册组件类型到 Registry
   * 
   * **作用域**：组件开发者定义组件类型
   * **使用场景**：Registry.register(), Spark.register()
   * 
   * @example
   * ```typescript
   * const gridDef: ComponentDefinition = {
   *   type: 'spark-ej2-grid',
   *   name: 'SPARK EJ2 Grid',
   *   version: '1.0.0',
   *   loader: () => import('./Grid.vue')
   * }
   * ```
   */
  export interface ComponentDefinition {
    /** 组件类型（kebab-case，如 'spark-ej2-grid'） */
    type: string
    
    /** 显示名称（如 'SPARK EJ2 Grid'） */
    name?: string
    
    /** Vue 组件（同步加载） */
    component?: unknown
    
    /** 懒加载函数（异步加载） */
    loader?: () => Promise<{ default: unknown }>
    
    /** 扩展字段（如 metadata, description 等） */
    [key: string]: unknown
  }

  /**
   * 组件上下文 - 组件实例 + 运行时管理的统一表示
   * 
   * 继承能力系统的最小接口 CapabilityContext（parent + providers）
   * 
   * **双重职责**：
   * 1. 组件实例配置（JSON 驱动渲染）- type, props, children
   * 2. 运行时状态管理 - id, state, providers, consumers
   * 
   * **使用场景**：
   * - JSON 配置：{ type, props, children } → 直接创建Context
   * - 运行时：父子关系、能力系统、生命周期管理
   * 
   * **能力系统核心理念**：
   * - 供方：context.providers.set(provider.name, provider) - 不关心谁使用
   * - 需方：context.consumers.set(name, consumer) - 不关心谁提供
   * - 查找：按 capabilityName 沿 parent 链向上查找（就近原则）
   */
  export interface ComponentContext extends CapabilityContext<CapabilityProvider> {
    // --------------------------------------------------------------------------
    // 实例标识（必需）
    // --------------------------------------------------------------------------
    
    /** 组件实例 ID（唯一标识） */
    id: string
    
    /** 组件类型（引用已注册的 ComponentDefinition.type） */
    type: string
    
    // --------------------------------------------------------------------------
    // 实例配置（JSON 驱动）
    // --------------------------------------------------------------------------
    
    /** 组件属性（从 JSON 配置传入） */
    props?: Record<string, unknown>
    
    /** 子组件上下文列表（递归结构，可选） */
    children?: ComponentContext[]
    
    // --------------------------------------------------------------------------
    // 运行时管理（继承自 CapabilityContext）
    // --------------------------------------------------------------------------
    
    /** parent 和 providers 继承自 CapabilityContext，使用 this 类型自动推导为 ComponentContext */
    
    /** 组件运行时状态（用于存储任意运行时数据，如内部状态、缓存等） */
    state: Record<string, unknown>
    
    /** 能力消费者映射 */
    consumers: Map<string, CapabilityConsumer>
    
    /** 能力提供者监听器（用于能力动态注册通知） */
    providerListeners?: Map<string, Set<(prov: CapabilityProvider) => void>>
    
    /** 日志记录器 */
    logger?: LoggerApi
    
    // --------------------------------------------------------------------------
    // 扩展字段（支持 visible, disabled 等）
    // --------------------------------------------------------------------------
    
    [key: string]: unknown
  }

  export interface ComponentRegistry {
    register(type: string, def: ComponentDefinition): void
    get(type: string): ComponentDefinition | undefined
    getAsync(type: string): Promise<ComponentDefinition | undefined> // 异步获取（自动加载）
    getAllTypes(): string[]
    has(type: string): boolean
    unregister(type: string): boolean
  }

  export interface ComponentManager {
    registerProvider(context: ComponentContext, provider: CapabilityProvider): void
    registerContext(context: ComponentContext): void
    destroyContext(id: string): boolean
    getProvider(context: ComponentContext, name: string): CapabilityProvider | undefined
    getContext(id: string): ComponentContext | undefined
    getAllContexts(): ComponentContext[]
    /** 创建组件上下文（从 JSON 配置或部分配置） */
    createContext(config: Partial<ComponentContext>, parent?: ComponentContext): ComponentContext
    /** 注册单个组件定义 */
    registerComponent(def: ComponentDefinition): void
    /** 批量注册组件定义 */
    registerComponents(defs: ComponentDefinition[]): void
    /** 获取组件定义 */
    getComponentDefinition(type: string): ComponentDefinition | undefined
    isComponentRegistered(type: string): boolean
    getRegisteredComponentTypes(): string[]
    /** 获取能力管理器（用于依赖注入架构） */
    getCapabilityManager?: () => unknown
  }

  export type PluginHooks = {
    afterComponentCreate?: (ctx: ComponentContext) => void | Promise<void>
    beforeComponentDestroy?: (ctx: ComponentContext) => void | Promise<void>
  }

  export interface Plugin {
    name: string
    description?: string
    install?: (manager: ComponentManager) => void
    uninstall?: (manager: ComponentManager) => void
    hooks?: Partial<PluginHooks>
  }
}

// Re-export capability types from common
export type { CapabilityProvider, CapabilityConsumer } from './common.js'

// DI keys for Vue injection
import type { InjectionKey } from 'vue'
export const SPARK_MANAGER_KEY: InjectionKey<Spark.ComponentManager> = Symbol('sparkManager') as InjectionKey<Spark.ComponentManager>
export const SPARK_REGISTRY_KEY: InjectionKey<Spark.ComponentRegistry> = Symbol('sparkRegistry') as InjectionKey<Spark.ComponentRegistry>

// Top-level aliases for simplified imports
export type ComponentDefinition = Spark.ComponentDefinition
export type ComponentContext = Spark.ComponentContext
export type ComponentRegistry = Spark.ComponentRegistry
export type ComponentManager = Spark.ComponentManager
export type PluginHooks = Spark.PluginHooks
export type Plugin = Spark.Plugin

/**
 * 实用类型别名：强类型 state 支持
 * 
 * 用于在组件中明确 state 的类型结构
 * 
 * @example
 * ```typescript
 * interface MyState { count: number; name: string }
 * const context = getContext() as TypedContext<MyState>
 * context.state.count  // ✅ 类型安全访问
 * ```
 */
export type TypedContext<TState = Record<string, unknown>> = Omit<ComponentContext, 'state'> & {
  state: TState
}

/**
 * 实用类型别名：强类型 state + props 支持
 * 
 * 用于在组件中同时明确 state 和 props 的类型结构
 * 
 * @example
 * ```typescript
 * interface MyState { count: number }
 * interface MyProps { title: string }
 * const context = getContext() as StrictContext<MyState, MyProps>
 * context.state.count  // ✅ 类型安全
 * context.props.title  // ✅ 类型安全
 * ```
 */
export type StrictContext<TState = Record<string, unknown>, TProps = Record<string, unknown>> = Omit<
  ComponentContext,
  'state' | 'props'
> & {
  state: TState
  props: TProps
}

