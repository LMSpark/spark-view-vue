import type { CapabilityProvider, CapabilityConsumer, LoggerApi } from './common.js'

export namespace Spark {
  export interface ComponentConfig {
    type: string
    id?: string
    name?: string
    props?: Record<string, unknown>
    children?: ComponentConfig[]
    [key: string]: unknown
  }

  export interface ComponentContext {
    id: string
    type: string
    config?: ComponentConfig
    parent?: ComponentContext | null
    children: ComponentContext[]
    state: Record<string, unknown>
    providers: Set<CapabilityProvider>
    consumers: Map<string, CapabilityConsumer>
    providerListeners?: Map<string, Set<(prov: CapabilityProvider) => void>>
    logger?: LoggerApi
  }

  export interface ComponentDefinition {
    type: string
    component: unknown
    name?: string
    version?: string
    validator?: (cfg: ComponentConfig) => boolean
    consumers?: CapabilityConsumer[]
    providers?: CapabilityProvider[]
  }

  export interface ComponentRegistry {
    register(type: string, def: ComponentDefinition): void
    get(type: string): ComponentDefinition | undefined
    getAllDefinitions(): ComponentDefinition[]
    getAllTypes(): string[]
    has(type: string): boolean
    unregister(type: string): boolean
    findCompatibleProviders?: (capabilityName: string, minVersion?: string) => string[]
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
    unregisterComponent(type: string): boolean
    createComponentTree(cfg: ComponentConfig): ComponentConfig
    validateComponentConfig(cfg: ComponentConfig): boolean
    getComponentCompatibility(): Record<string, string[]>
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
export type ComponentDefinition = Spark.ComponentDefinition
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

