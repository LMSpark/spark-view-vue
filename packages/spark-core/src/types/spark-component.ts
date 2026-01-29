export interface SparkComponentConfig {
  type: string
  id?: string
  name?: string
  [key: string]: any
}

export interface SparkProviderInterface {
  [method: string]: boolean
}

export interface SparkCapabilityProvider {
  name: string
  version?: string
  interface?: SparkProviderInterface
  implementation?: Record<string, any>
}

export type SparkCapabilityConsumer = {
  capabilityName: string
  interface?: Record<string, any>
  implementation?: any
  minVersion?: string
  onProvide?: (prov: SparkCapabilityProvider) => void
}

export interface SparkComponentContext {
  id: string
  type?: string
  config?: SparkComponentConfig
  parent?: SparkComponentContext | null
  children: SparkComponentContext[]
  state?: Record<string, any>
  providers: Set<SparkCapabilityProvider>
  consumers: Map<string, SparkCapabilityConsumer>
  providerListeners?: Map<string, Set<(prov: SparkCapabilityProvider) => void>>
  logger?: any
}

export interface SparkComponentManager {
  registerProvider(context: SparkComponentContext, provider: SparkCapabilityProvider): void
  registerContext(context: SparkComponentContext): void
  destroyContext(id: string): void
  getProvider(context: SparkComponentContext, name: string): SparkCapabilityProvider | undefined
}

export type SparkPluginHooks = {
  afterComponentCreate?: (config: SparkComponentConfig, ctx: SparkComponentContext) => void | Promise<void>
  beforeComponentDestroy?: (ctx: SparkComponentContext) => void | Promise<void>
}

export interface SparkPlugin {
  name: string
  version?: string
  description?: string
  install?: (manager: any) => void
  uninstall?: (manager: any) => void
  hooks?: Partial<SparkPluginHooks>
}

export interface SparkComponentDefinition {
  type: string
  component: any
  name?: string
  version?: string
  validator?: (cfg: SparkComponentConfig) => boolean
  consumers?: SparkCapabilityConsumer[]
  providers?: SparkCapabilityProvider[]
}

export interface SparkComponentRegistry {
  register(type: string, def: SparkComponentDefinition): void
  get(type: string): SparkComponentDefinition | undefined
  getAllDefinitions(): SparkComponentDefinition[]
  getAllTypes(): string[]
  has(type: string): boolean
  unregister(type: string): boolean
  findCompatibleProviders?: (capabilityName: string, minVersion?: string) => string[]
}
