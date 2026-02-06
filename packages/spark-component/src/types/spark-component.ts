import type { CapabilityProvider, CapabilityConsumer, LoggerApi } from './common.js'
import type { Context as CapabilityContext } from '@spark-view/spark-utils'

export namespace Spark {
  /**
   * 组件配置 - 同时支持组件定义和实例配置
   * 
   * **组件定义**（注册时使用）：
   * - type, name, version, component, loader
   * 
   * **实例配置**（JSON 驱动渲染时使用）：
   * - type, id, props, children
   * 
   * **能力系统**：
   * - 通过 ComponentContext.providers/consumers 管理，不在配置中
   */
  export interface ComponentConfig {
    // --------------------------------------------------------------------------
    // 核心标识
    // --------------------------------------------------------------------------
    
    /** 组件类型（kebab-case，如 'spark-ej2-grid'） */
    type: string
    
    /** 显示名称（如 'SPARK EJ2 Grid'） */
    name?: string
    
    /** 实例 ID（实例化时分配） */
    id?: string
    
    // --------------------------------------------------------------------------
    // 组件定义（注册时使用）
    // --------------------------------------------------------------------------
    
    /** Vue 组件实例 */
    component?: unknown
    
    /** 懒加载函数（动态导入） */
    loader?: () => Promise<{ default: unknown }>
    
    /** 版本号（语义化版本） */
    version?: string
    
    // --------------------------------------------------------------------------
    // 实例配置（JSON 驱动时使用）
    // --------------------------------------------------------------------------
    
    /** 组件属性 */
    props?: Record<string, unknown>
    
    /** 子组件配置 */
    children?: ComponentConfig[]
    
    // --------------------------------------------------------------------------
    // 扩展字段
    // --------------------------------------------------------------------------
    
    [key: string]: unknown
  }

  /**
   * 组件上下文
   * 
   * 继承能力系统的最小接口 CapabilityContext（parent + providers）
   * 添加组件特定属性：id, type, children, consumers, state, config 等
   * 
   * 能力系统核心理念：
   * - 供方：context.providers.add(provider) - 不关心谁使用
   * - 需方：context.consumers.set(name, consumer) - 不关心谁提供
   * - 查找：按 capabilityName 沿 parent 链向上查找（就近原则）
   */
  export interface ComponentContext extends CapabilityContext<CapabilityProvider> {
    id: string
    type: string
    config?: ComponentConfig
    // parent 继承自 CapabilityContext
    parent?: ComponentContext | null
    // providers 覆盖基类定义，使用具体类型
    providers: Set<CapabilityProvider>
    children: ComponentContext[]
    state: Record<string, unknown>
    consumers: Map<string, CapabilityConsumer>
    providerListeners?: Map<string, Set<(prov: CapabilityProvider) => void>>
    logger?: LoggerApi
  }

  export interface ComponentRegistry {
    register(type: string, def: ComponentConfig): void
    get(type: string): ComponentConfig | undefined
    getAsync(type: string): Promise<ComponentConfig | undefined> // 异步获取（自动加载）
    getAllDefinitions(): ComponentConfig[]
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
    registerComponent(def: ComponentConfig): void
    registerComponents(defs: ComponentConfig[]): void
    getComponentDefinition(type: string): ComponentConfig | undefined
    isComponentRegistered(type: string): boolean
    getRegisteredComponentTypes(): string[]
  }

  export type PluginHooks = {
    afterComponentCreate?: (config: ComponentConfig, ctx: ComponentContext) => void | Promise<void>
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

// Top-level aliases for simplified imports
export type ComponentConfig = Spark.ComponentConfig
export type ComponentContext = Spark.ComponentContext
export type ComponentRegistry = Spark.ComponentRegistry
export type ComponentManager = Spark.ComponentManager
export type PluginHooks = Spark.PluginHooks
export type Plugin = Spark.Plugin

// Re-export capability types from common
export type { CapabilityProvider, CapabilityConsumer } from './common.js'

// DI keys for Vue injection
import type { InjectionKey } from 'vue'
export const SPARK_MANAGER_KEY: InjectionKey<ComponentManager> = Symbol('sparkManager') as unknown as InjectionKey<ComponentManager>
export const SPARK_REGISTRY_KEY: InjectionKey<ComponentRegistry> = Symbol('sparkRegistry') as unknown as InjectionKey<ComponentRegistry>

