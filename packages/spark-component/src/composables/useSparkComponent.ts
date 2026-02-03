import { reactive, computed, onMounted, onUnmounted, markRaw, inject } from 'vue'
import { Logger } from '@spark-view/spark-utils'
import { capabilityManager } from '../utils/SparkCapabilitySystem.js'
import { createEventCapabilityProvider, createEventCapabilityConsumer } from '../capabilities/EventCapability.js'
import type { EventCapabilityProvider } from '../capabilities/EventCapability.js'
import type { ComponentConfig, ComponentContext, CapabilityProvider, CapabilityConsumer, ComponentManager, ComponentRegistry } from '../types/spark-component.js'
import { SPARK_MANAGER_KEY, SPARK_REGISTRY_KEY } from '../types/spark-component.js'
import type { Implementation, CapabilityInterface } from '../types/common.js'

// Local helper to create a noop provider when a capability is missing. This avoids any global registry side-effects.
function createNoopProvider(name: string): CapabilityProvider {
  return { name, version: '0.0.0', interface: {} as CapabilityInterface, implementation: {} }
}

export function useSparkComponent<TConfig extends ComponentConfig = ComponentConfig>(
  config: TConfig,
  options?: {
    manager?: ComponentManager
    registry?: ComponentRegistry
    parentContext?: ComponentContext
  }
): {
  context: ComponentContext
  isVisible: unknown
  isDisabled: unknown
  provide: (name: string, implementation?: Implementation) => void
  provideEvents: (name?: string) => EventCapabilityProvider
  getProvider: (name: string) => CapabilityProvider | undefined
  getInheritedProvider: <T = unknown>(name: string, ctx?: ComponentContext) => T | undefined
  consume: (name: string) => Implementation | null
  consumeEvents: (name: string, handlers: Record<string, (...args: any[]) => void>) => EventCapabilityProvider | null
  use: (name: string) => Implementation | null
  whenAvailable: (name: string) => Promise<CapabilityProvider>
  initialize: () => void
  destroy: () => void
  logger: ReturnType<typeof Logger>
  getComponent: (type: string) => unknown
  isComponentRegistered: (type: string) => boolean
  getOrCreateNoopProvider: (name: string) => CapabilityProvider
  connectCapability: (provider: CapabilityProvider, consumer: CapabilityConsumer, ctx: ComponentContext) => void
  disconnectCapability: (provider: CapabilityProvider, consumer: CapabilityConsumer, ctx: ComponentContext) => void
} {
  const parentContext = options?.parentContext

  const ctxRaw: ComponentContext = {
    id: config.id ?? `spark-${Date.now()}-${Math.random().toString(36).substr(2,9)}`,
    type: config.type,
    parent: parentContext,
    children: [],
    config: config,
    state: {},
    providers: new Set<CapabilityProvider>(),
    consumers: new Map<string, CapabilityConsumer>()
  }

  const context = reactive(ctxRaw)
  const logger = Logger(`Spark:${config.type}`)

  // Resolve manager via explicit option or DI (Symbol-based); fail fast to enforce DI-first design
  const resolvedManager = options?.manager ?? (inject(SPARK_MANAGER_KEY)) ?? (inject('sparkManager'))
  if (!resolvedManager) throw new Error('Component manager not found. Provide via options.manager or install Spark Vue plugin with a manager (Spark.createVuePlugin({ manager })).')
  const manager = resolvedManager

  const isVisible = computed(() => ((config as ComponentConfig) as { visible?: boolean }).visible !== false)
  const isDisabled = computed(() => ((config as ComponentConfig) as { disabled?: boolean }).disabled === true)

  const initialize = () => logger.info(`🚀 Initializing SPARK component: ${context.type} (${context.id})`)
  const destroy = () => {
    logger.info(`🗑️ Destroying SPARK component: ${context.type} (${context.id})`)
    context.providers.clear()
    context.consumers.clear()
    try { manager && typeof (manager).destroyContext === 'function' && (manager).destroyContext(context.id) } catch (e: unknown) { logger.warn('Failed to destroy context via manager', String(e)) }
  }

  function getProvider(name: string): CapabilityProvider | undefined {
    for (const p of Array.from(context.providers)) if (p.name === name) return p
    return undefined
  }

  // Provide a capability on this context
  function provide(name: string, implementation?: Implementation) {
    const p: CapabilityProvider = { name, version: '1.0.0', interface: {} as CapabilityInterface, implementation }
    if (manager && typeof (manager).registerProvider === 'function') (manager).registerProvider(context, p)
    else context.providers.add(p)
    logger.info(`🔌 Provided capability: ${name} for ${context.type} (${context.id})`)
  }

  // Provide event capability - convenient wrapper
  function provideEvents(name = 'events'): EventCapabilityProvider {
    const { provider, emitter } = createEventCapabilityProvider(name)
    if (manager && typeof (manager).registerProvider === 'function') {
      (manager).registerProvider(context, provider)
    } else {
      context.providers.add(provider)
    }
    logger.info(`🎉 Provided event capability: ${name} for ${context.type} (${context.id})`)
    return emitter
  }

  function consume(name: string): Implementation | null {
    const consumer: CapabilityConsumer = { capabilityName: name, interface: {}, implementation: undefined }
    context.consumers.set(name, consumer)
    const provider = manager.getProvider(context, name) ?? createNoopProvider(name)
    if (provider) {
      consumer.implementation = ((provider).implementation ?? (provider as unknown as Implementation)) as Implementation | undefined
      try { capabilityManager.connectCapability(provider, consumer, context) } catch (e: unknown) { logger.warn('autoConnectCapabilities failed', String(e)) }
      logger.info(`🔌 Consumed capability: ${name} for ${context.type} (${context.id})`)
      return consumer.implementation ?? null
    }
    logger.warn(`⚠️ Capability not found (registered consumer for late-binding): ${name} for ${context.type} (${context.id})`)
    return null
  }

  // Consume event capability - convenient wrapper
  function consumeEvents(
    name: string,
    handlers: Record<string, (...args: any[]) => void>
  ): EventCapabilityProvider | null {
    const consumer = createEventCapabilityConsumer(name, handlers)
    context.consumers.set(name, consumer)
    
    const provider = manager.getProvider(context, name)
    if (provider) {
      consumer.implementation = provider.implementation
      try {
        capabilityManager.connectCapability(provider, consumer, context)
        logger.info(`🎉 Consumed event capability: ${name} for ${context.type} (${context.id})`)
        return provider.implementation as unknown as EventCapabilityProvider
      } catch (e: unknown) {
        logger.warn('Failed to connect event capability', String(e))
      }
    }
    
    logger.warn(`⚠️ Event capability not found: ${name} for ${context.type} (${context.id})`)
    return null
  }

  function whenAvailable(name: string): Promise<CapabilityProvider> {
    const p = getProvider(name)
    if (p) return Promise.resolve(p)
    return new Promise(resolve => {
      context.providerListeners = context.providerListeners ?? new Map()
      if (!context.providerListeners.has(name)) context.providerListeners.set(name, new Set())
      const set = context.providerListeners.get(name) ?? new Set()
      const cb = (prov: CapabilityProvider) => { set.delete(cb); resolve(prov) }
      set.add(cb)
    })
  }

  onMounted(() => {
    initialize()
    const mgr = manager
    if (!mgr) throw new Error('Component manager not found during mount. Ensure Spark plugin was installed or a manager passed via options.')
    mgr.registerContext(context)
    logger.info(`📝 Registered context to manager: ${context.id}`)
  })

  onUnmounted(() => {
    if (!manager) { logger.error('Component manager not found during unmount.'); return }
    try { manager.destroyContext(context.id); logger.info(`🗑️ Destroyed context via manager: ${context.id}`) } catch (e) { logger.error('Failed to destroy context via manager', String(e)); destroy() }
  })

  // register default capability exposing the runtime context to consumers
  provide('sparkContext', context)

  return {
    context,
    isVisible,
    isDisabled,
    provide,
    provideEvents,
    getProvider,
    getInheritedProvider: <T = unknown>(name: string, ctx?: ComponentContext) => {
      let t: ComponentContext | undefined = ctx ?? context
      while (t) {
        const p = Array.from(t.providers).find(pr => pr.name === name)
        if (p?.implementation !== undefined) return p.implementation as unknown as T
        t = t.parent ?? undefined
      }
      return undefined
    },
    consume,
    consumeEvents,
    use: consume, // Alias for consume - more intuitive naming
    whenAvailable,
    initialize,
    destroy,
    logger,
    getComponent: (type: string) => {
      // Prefer manager-backed registry
      try {
        const def = (manager).getComponentDefinition(type)
        const comp = def?.component
        return comp ? markRaw(comp) : undefined
      } catch {
        // fallback to injected registry if present
        const registry = options?.registry ?? (inject(SPARK_REGISTRY_KEY))
        if (!registry) return undefined
        const comp = registry.get(type)?.component
        return comp ? markRaw(comp) : undefined
      }
    },
    isComponentRegistered: (type: string) => {
      try { return (manager).isComponentRegistered(type) } catch { const registry = options?.registry ?? (inject(SPARK_REGISTRY_KEY)); return registry ? registry.has(type) : false }
    },
    getOrCreateNoopProvider: (name: string) => createNoopProvider(name),
    connectCapability: (provider: CapabilityProvider, consumer: CapabilityConsumer, ctx: ComponentContext) => capabilityManager.connectCapability(provider, consumer, ctx),
    disconnectCapability: (provider: CapabilityProvider, consumer: CapabilityConsumer, ctx: ComponentContext) => capabilityManager.disconnectCapability(provider, consumer, ctx)
  }
}

