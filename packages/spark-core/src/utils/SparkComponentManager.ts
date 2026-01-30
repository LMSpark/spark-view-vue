import { componentRegistry as defaultRegistry } from './SparkComponentRegistry.js'
import { Logger } from './logger.js'
import { capabilityManager } from './SparkCapabilitySystem.js'
import type { ComponentConfig, ComponentContext, ComponentDefinition, CapabilityProvider, CapabilityConsumer, ComponentRegistry, ComponentManager } from '../types/spark-component.js'

export class SparkComponentManagerImpl {
  private contexts = new Map<string, ComponentContext>()
  private renderer: unknown
  private registry: ComponentRegistry
  private logger = Logger()

  constructor(renderer?: unknown, registry?: ComponentRegistry) {
    this.renderer = renderer
    this.registry = registry || defaultRegistry
  }

  createContext(config: ComponentConfig, parent?: ComponentContext): ComponentContext {
    const ctx: ComponentContext = {
      id: config.id || this.generateId(),
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

  render(config: ComponentConfig, parentContext?: ComponentContext): unknown {
    const ctx = this.createContext(config, parentContext)
    // For now renderer delegates to component registry to build an instance placeholder
    const def = this.registry.get(config.type)
    if (!def) throw new Error(`Component type '${config.type}' is not registered`)
    const instance = { type: 'vue-component', component: def.component, props: { config, context: ctx } }
    this.logger.info(`Rendered component: ${config.type} (${ctx.id})`)
    return instance
  }

  getContext(id: string): ComponentContext | undefined {
    return this.contexts.get(id)
  }

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

  registerProvider(context: ComponentContext, provider: CapabilityProvider): void {
    context.providers.add(provider)
    try { capabilityManager.autoConnectCapabilities(context) } catch {}

    // notify any listeners waiting for a provider
    if (context.providerListeners && context.providerListeners.has(provider.name)) {
      const set = context.providerListeners.get(provider.name) as Set<(prov: CapabilityProvider) => void>
      set.forEach(cb => {
        try { cb(provider) } catch (e: unknown) { this.logger.warn('provider listener threw', String(e)) }
      })
      set.clear()
    }
  }

  registerContext(context: ComponentContext): void {
    if (!this.contexts.has(context.id)) this.contexts.set(context.id, context)
  }

  getAllContexts(): ComponentContext[] {
    return Array.from(this.contexts.values())
  }

  getProvider(context: ComponentContext, capabilityName: string): CapabilityProvider | undefined {
    const provider = Array.from(context.providers).find(p => p.name === capabilityName)
    if (provider) return provider
    if (context.parent) return this.getProvider(context.parent, capabilityName)
    return undefined
  }

  registerComponent(def: ComponentDefinition) {
    this.registry.register(def.type, def)
  }

  registerComponents(defs: ComponentDefinition[]) {
    defs.forEach(d => this.registerComponent(d))
  }

  getComponentDefinition(type: string) {
    return this.registry.get(type)
  }

  isComponentRegistered(type: string) {
    return this.registry.has(type)
  }

  getRegisteredComponentTypes(): string[] {
    return this.registry.getAllTypes()
  }

  unregisterComponent(type: string) {
    return this.registry.unregister(type)
  }

  createComponentTree(cfg: ComponentConfig) {
    const copy = { ...cfg } as ComponentConfig & { children?: ComponentConfig[] }
    if (copy.children) copy.children = copy.children.map((c: ComponentConfig) => this.createComponentTree(c))
    return copy
  }

  validateComponentConfig(cfg: ComponentConfig): boolean {
    const def = this.registry.get(cfg.type)
    if (!def) return false
    if (def.validator) return def.validator(cfg)
    return true
  }

  getComponentCompatibility(): Record<string, string[]> {
    const map: Record<string, string[]> = {}
    this.registry.getAllDefinitions().forEach(def => {
      if (def.consumers) {
        def.consumers.forEach(cons => {
          const arr = map[cons.capabilityName] = map[cons.capabilityName] || []
          let providers: string[] = []
          if (typeof this.registry.findCompatibleProviders === 'function') providers = this.registry.findCompatibleProviders(cons.capabilityName, cons.minVersion)
          arr.push(...providers)
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

export const componentManager = new SparkComponentManagerImpl()

/**
 * Create a new component manager instance. Optionally pass a renderer (e.g., test renderer) implementation.
 */
export function createComponentManager(renderer?: unknown, registry?: ComponentRegistry): ComponentManager {
  return new SparkComponentManagerImpl(renderer, registry)
}

// NOTE: convenience helpers were removed to avoid duplicating the public namespace API.
// Use `Spark.manager()` or `componentManager` directly.