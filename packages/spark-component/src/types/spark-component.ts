import type { CapabilityProvider, CapabilityConsumer, LoggerApi } from './common.js'
import type { Context as CapabilityContext } from '@spark-view/spark-utils'

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
    
    /** 版本号（语义化版本，默认 '1.0.0'） */
    version?: string
    
    /** Vue 组件（同步加载） */
    component?: unknown
    
    /** 懒加载函数（异步加载） */
    loader?: () => Promise<{ default: unknown }>
    
    /** 扩展字段（如 metadata, description 等） */
    [key: string]: unknown
  }

  /**
   * 组件实例配置 - JSON 驱动渲染
   * 
   * **作用域**：页面配置，实例化已注册的组件
   * **使用场景**：Renderer.render(), pages-config/pagedata.json
   * 
   * @example
   * ```typescript
   * const gridInstance: ComponentInstance = {
   *   type: 'spark-ej2-grid',  // 引用已注册的组件
   *   id: 'grid-1',
   *   props: { dataSource: [...] },
   *   children: [
   *     { type: 'spark-ej2-column', props: { field: 'name' } }
   *   ]
   * }
   * ```
   */
  export interface ComponentInstance {
    /** 组件类型（引用已注册的组件） */
    type: string
    
    /** 实例 ID（唯一标识，可选） */
    id?: string
    
    /** 组件属性 */
    props?: Record<string, unknown>
    
    /** 子组件实例配置 */
    children?: ComponentInstance[]
    
    /** 扩展字段（如 visible, disabled 等） */
    [key: string]: unknown
  }

  /**
   * @deprecated 使用 ComponentDefinition （注册）或 ComponentInstance（渲染）
   * 为了向后兼容保留，将在下个主版本移除
   */
  export type ComponentConfig = ComponentDefinition & ComponentInstance

  /**
   * 组件上下文 - 组件实例的运行时表示
   * 
   * 继承能力系统的最小接口 CapabilityContext（parent + providers）
   * 添加组件特定属性：id, type, children, consumers, state 等
   * 
   * **核心职责**：
   * - 组件实例的唯一运行时表示（不再需要持有配置对象）
   * - 管理父子组件关系
   * - 能力系统的集成点
   * - 组件生命周期状态存储
   * 
   * **能力系统核心理念**：
   * - 供方：context.providers.add(provider) - 不关心谁使用
   * - 需方：context.consumers.set(name, consumer) - 不关心谁提供
   * - 查找：按 capabilityName 沿 parent 链向上查找（就近原则）
   */
  export interface ComponentContext extends CapabilityContext<CapabilityProvider> {
    /** 组件实例 ID（唯一标识） */
    id: string
    
    /** 组件类型（引用已注册的 ComponentDefinition.type） */
    type: string
    
    /** 父组件上下文（继承自 CapabilityContext，可为 null） */
    parent?: ComponentContext | null
    
    /** 能力提供者集合（覆盖基类定义，使用具体类型） */
    providers: Set<CapabilityProvider>
    
    /** 子组件上下文列表 */
    children: ComponentContext[]
    
    /** 组件运行时状态（用于存储任意运行时数据，如原始 props、内部状态等） */
    state: Record<string, unknown>
    
    /** 能力消费者映射 */
    consumers: Map<string, CapabilityConsumer>
    
    /** 能力提供者监听器（用于能力动态注册通知） */
    providerListeners?: Map<string, Set<(prov: CapabilityProvider) => void>>
    
    /** 日志记录器 */
    logger?: LoggerApi
  }

  export interface ComponentRegistry {
    register(type: string, def: ComponentDefinition): void
    get(type: string): ComponentDefinition | undefined
    getAsync(type: string): Promise<ComponentDefinition | undefined> // 异步获取（自动加载）
    getAllDefinitions(): ComponentDefinition[]
    getAllTypes(): string[]
    has(type: string): boolean
    unregister(type: string): boolean
    findCompatibleProviders?: (capabilityName: string, minVersion?: string) => string[]
    preload?(types: string[]): Promise<void> // 预加载组件
  }

  export interface ComponentManager {
    registerProvider(context: ComponentContext, provider: CapabilityProvider): void
    registerContext(context: ComponentContext): void
    destroyContext(id: string): boolean
    getProvider(context: ComponentContext, name: string): CapabilityProvider | undefined
    getContext(id: string): ComponentContext | undefined
    getAllContexts(): ComponentContext[]
    registerComponent(def: ComponentDefinition): void
    registerComponents(defs: ComponentDefinition[]): void
    getComponentDefinition(type: string): ComponentDefinition | undefined
    isComponentRegistered(type: string): boolean
    getRegisteredComponentTypes(): string[]
  }

  export type PluginHooks = {
    afterComponentCreate?: (instance: ComponentInstance, ctx: ComponentContext) => void | Promise<void>
    beforeComponentDestroy?: (ctx: ComponentContext) => void | Promise<void>
  }

  export interface Plugin {
    name: string
    version?: string
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
export const SPARK_MANAGER_KEY: InjectionKey<Spark.ComponentManager> = Symbol('sparkManager') as unknown as InjectionKey<Spark.ComponentManager>
export const SPARK_REGISTRY_KEY: InjectionKey<Spark.ComponentRegistry> = Symbol('sparkRegistry') as unknown as InjectionKey<Spark.ComponentRegistry>

// Top-level aliases for simplified imports
export type ComponentDefinition = Spark.ComponentDefinition
export type ComponentInstance = Spark.ComponentInstance
export type ComponentConfig = Spark.ComponentConfig  // @deprecated 使用 ComponentDefinition 或 ComponentInstance
export type ComponentContext = Spark.ComponentContext
export type ComponentRegistry = Spark.ComponentRegistry
export type ComponentManager = Spark.ComponentManager
export type PluginHooks = Spark.PluginHooks
export type Plugin = Spark.Plugin

