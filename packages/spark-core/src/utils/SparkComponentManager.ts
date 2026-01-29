import { globalComponentRegistry } from './SparkComponentRegistry.js'
import { Logger } from './logger.js'
import { autoConnectCapabilities, disconnectAllCapabilities } from './SparkCapabilitySystem.js'
import type { SparkComponentConfig, SparkComponentContext, SparkComponentDefinition, SparkCapabilityProvider } from '../types/spark-component.js'

class SparkComponentManagerImpl {
  private contexts = new Map<string, SparkComponentContext>()
  private renderer: any
  private logger = Logger()

  constructor(renderer?: any) {
    this.renderer = renderer
  }

  createContext(config: SparkComponentConfig, parent?: SparkComponentContext): SparkComponentContext {
    const ctx: SparkComponentContext = {
      id: config.id || this.generateId(),
      type: config.type,
      parent,
      children: [],
      config,
      state: {},
      providers: new Set<SparkCapabilityProvider>(),
      consumers: new Map<string, any>()
    }
    if (parent) parent.children.push(ctx)
    this.contexts.set(ctx.id, ctx)
    return ctx
  }

  render(config: SparkComponentConfig, parentContext?: SparkComponentContext): unknown {
    const ctx = this.createContext(config, parentContext)
    // For now renderer delegates to component registry to build an instance placeholder
    const def = globalComponentRegistry.get(config.type)
    if (!def) throw new Error(`Component type '${config.type}' is not registered`)
    const instance = { type: 'vue-component', component: def.component, props: { config, context: ctx } }
    this.logger.info(`Rendered component: ${config.type} (${ctx.id})`)
    return instance
  }

  getContext(id: string): SparkComponentContext | undefined {
    return this.contexts.get(id)
  }

  destroyContext(id: string): boolean {
    const ctx = this.contexts.get(id)
    if (!ctx) return false
    try {
      disconnectAllCapabilities(ctx)
      if (ctx.parent) ctx.parent.children = ctx.parent.children.filter(c => c.id !== id)
      const walk = (c: SparkComponentContext) => {
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

  registerProvider(context: SparkComponentContext, provider: SparkCapabilityProvider): void {
    context.providers.add(provider)
    try { autoConnectCapabilities(context) } catch {}
  }

  registerContext(context: SparkComponentContext): void {
    if (!this.contexts.has(context.id)) this.contexts.set(context.id, context)
  }

  getAllContexts(): SparkComponentContext[] {
    return Array.from(this.contexts.values())
  }

  getProvider(context: SparkComponentContext, capabilityName: string) {
    const provider = Array.from(context.providers).find(p => p.name === capabilityName)
    if (provider) return provider
    if (context.parent) return this.getProvider(context.parent, capabilityName)
    return undefined
  }

  registerComponent(def: SparkComponentDefinition) {
    globalComponentRegistry.register(def.type, def)
  }

  registerComponents(defs: SparkComponentDefinition[]) {
    defs.forEach(d => this.registerComponent(d))
  }

  getComponentDefinition(type: string) {
    return globalComponentRegistry.get(type)
  }

  isComponentRegistered(type: string) {
    return globalComponentRegistry.has(type)
  }

  getRegisteredComponentTypes(): string[] {
    return globalComponentRegistry.getAllTypes()
  }

  unregisterComponent(type: string) {
    return globalComponentRegistry.unregister(type)
  }

  createComponentTree(cfg: SparkComponentConfig) {
    const copy = { ...cfg }
    if (copy.children) copy.children = copy.children.map(c => this.createComponentTree(c))
    return copy
  }

  validateComponentConfig(cfg: SparkComponentConfig): boolean {
    const def = globalComponentRegistry.get(cfg.type)
    if (!def) return false
    if (def.validator) return def.validator(cfg)
    return true
  }

  getComponentCompatibility(): Record<string, string[]> {
    const map: Record<string, string[]> = {}
    globalComponentRegistry.getAllDefinitions().forEach(def => {
      if (def.consumers) {
        def.consumers.forEach(cons => {
          map[cons.capabilityName] = map[cons.capabilityName] || []
          const providers = (globalComponentRegistry as any).findCompatibleProviders ? (globalComponentRegistry as any).findCompatibleProviders(cons.capabilityName, cons.minVersion) : []
          map[cons.capabilityName].push(...providers.map(p => (p as any).type))
        })
      }
    })
    Object.keys(map).forEach(k => map[k] = Array.from(new Set(map[k])))
    return map
  }

  private generateId(): string {
    return `spark-${Date.now()}-${Math.random().toString(36).substr(2,9)}`
  }
}

export const globalSparkComponentManager = new SparkComponentManagerImpl()
export function getGlobalSparkComponentManager() { return globalSparkComponentManager }
export function registerSparkComponent(def: any) { globalSparkComponentManager.registerComponent(def) }
export function renderSparkComponent(cfg: SparkComponentConfig, parent?: SparkComponentContext) {
  return globalSparkComponentManager.render(cfg, parent)
}
export function getSparkComponentDefinition(type: string) { return globalSparkComponentManager.getComponentDefinition(type) }
export function createSparkComponentTree(cfg: SparkComponentConfig) { return globalSparkComponentManager.createComponentTree(cfg) }
export function validateSparkComponentConfig(cfg: SparkComponentConfig) { return globalSparkComponentManager.validateComponentConfig(cfg) }
export function registerSparkComponents(defs: any[]) { globalSparkComponentManager.registerComponents(defs) }