// Core public interfaces for packages/spark-core

export interface IComponentDefinition {
  type: string
  name?: string
  version?: string
}

export interface IComponentRegistry {
  register(def: IComponentDefinition): void
  unregister(type: string): boolean
  get(type: string): IComponentDefinition | undefined
  has(type: string): boolean
  getAllTypes(): string[]
}

export interface IComponentContext {
  id: string
  type: string
  parentId?: string
  providers: Record<string, any>
  consumers: Record<string, any>
}

export interface IComponentManager {
  registerComponent(def: IComponentDefinition): void
  createContext(cfg: { type: string; id?: string }, parentId?: string): IComponentContext
  destroyContext(id: string): void
  getContext(id: string): IComponentContext | undefined
  getAllContexts(): IComponentContext[]
}

export interface ICapabilityProvider {
  name: string
  version?: string
  interface?: unknown
  implementation?: unknown
}

export interface ICapabilityManager {
  registerConnector(name: string, impl: unknown): void
  connect(provider: ICapabilityProvider, consumer: unknown): boolean
  disconnect(providerName: string, consumer: unknown): void
}

export interface ILogger {
  debug(...args: any[]): void
  info(...args: any[]): void
  warn(...args: any[]): void
  error(...args: any[]): void
}

export interface ISparkPlugin {
  name: string
  install(manager: IComponentManager): void | Promise<void>
  uninstall?(manager: IComponentManager): void | Promise<void>
}
