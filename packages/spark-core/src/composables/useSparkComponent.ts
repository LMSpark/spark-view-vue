import { reactive, computed, onMounted, onUnmounted, markRaw, inject } from 'vue'
import { Logger } from '../utils/logger.js'
import { getOrCreateNoopProvider, getGlobalProvider } from '../utils/GlobalProviderRegistry.js'
import { capabilityManager } from '../utils/SparkCapabilitySystem.js'
import type { ComponentConfig, ComponentContext, CapabilityProvider, CapabilityConsumer } from '../types/spark-component.js'
import type { Implementation } from '../types/common.js'
import { defaultComponentManager, defaultComponentRegistry } from '../factories.js'

export function useComponent(config: ComponentConfig, parentContext?: ComponentContext) {
  const ctxRaw: ComponentContext = {
    id: config.id || `spark-${Date.now()}-${Math.random().toString(36).substr(2,9)}`,
    type: config.type,
    parent: parentContext,
    children: [],
    config: config,
    state: {},
    providers: new Set<CapabilityProvider>(),
    consumers: new Map<string, CapabilityConsumer>()
  }

  const context = reactive(ctxRaw)
  const logger = Logger(context)
  const injectedManager = inject('sparkManager') as unknown
  const manager = (injectedManager as any) ?? defaultComponentManager

  const isVisible = computed(() => config.visible !== false)
  const isDisabled = computed(() => config.disabled === true)

  const initialize = () => logger.info(`🚀 Initializing SPARK component: ${context.type} (${context.id})`)
  const destroy = () => {
    logger.info(`🗑️ Destroying SPARK component: ${context.type} (${context.id})`)
    context.providers.clear()
    context.consumers.clear()
    try { manager && typeof manager.destroyContext === 'function' && manager.destroyContext(context.id) } catch (e: unknown) { logger.warn('Failed to destroy context via manager', String(e)) }
  }

  function getProvider(name: string): CapabilityProvider | undefined {
    for (const p of Array.from(context.providers)) if (p.name === name) return p
    return undefined
  }

  // Provide a capability on this context
  function provide(name: string, implementation?: Implementation) {
    const p: CapabilityProvider = { name, version: '1.0.0', interface: {}, implementation }
    if (manager && typeof manager.registerProvider === 'function') manager.registerProvider(context, p)
    else context.providers.add(p)
    logger.info(`🔌 Provided capability: ${name} for ${context.type} (${context.id})`)
  }

  function consume(name: string) {
    const consumer: CapabilityConsumer = { capabilityName: name, interface: {}, implementation: undefined }
    context.consumers.set(name, consumer)
    const provider = getProvider(name) || getGlobalProvider(name) || getOrCreateNoopProvider(name)
    if (provider) {
      consumer.implementation = ((provider as CapabilityProvider).implementation ?? (provider as unknown as Implementation)) as Implementation | undefined
      try { capabilityManager.connectCapability(provider as CapabilityProvider, consumer, context) } catch (e: unknown) { logger.warn('autoConnectCapabilities failed', String(e)) }
      logger.info(`🔌 Consumed capability: ${name} for ${context.type} (${context.id})`)
      return consumer.implementation
    }
    logger.warn(`⚠️ Capability not found (registered consumer for late-binding): ${name} for ${context.type} (${context.id})`)
    return null
  }

  function whenAvailable(name: string): Promise<CapabilityProvider> {
    const p = getProvider(name)
    if (p) return Promise.resolve(p)
    return new Promise(resolve => {
      context.providerListeners = context.providerListeners || new Map()
      if (!context.providerListeners.has(name)) context.providerListeners.set(name, new Set())
      const set = context.providerListeners.get(name)!
      const cb = (prov: CapabilityProvider) => { set.delete(cb); resolve(prov) }
      set.add(cb)
    })
  }

  onMounted(() => {
    initialize()
    const mgr = manager
    if (!mgr) throw new Error('sparkManager not found. Ensure `app.provide("sparkManager", Spark.manager())` is called in application entry.')
    mgr.registerContext(context)
    logger.info(`📝 Registered context to manager: ${context.id}`)
  })

  onUnmounted(() => {
    if (!manager) { logger.error('sparkManager not found during unmount. Ensure application provides sparkManager.'); return }
    try { manager.destroyContext(context.id); logger.info(`🗑️ Destroyed context via manager: ${context.id}`) } catch (e) { logger.error('Failed to destroy context via manager', String(e)); destroy() }
  })

  provide('sparkContext', context)

  return {
    context,
    isVisible,
    isDisabled,
    provide,
    getProvider,
    getInheritedProvider: <T = unknown>(name: string, ctx?: ComponentContext) => {
      let t: ComponentContext | undefined = ctx ?? context
      while (t) {
        const p = Array.from(t.providers).find(pr => pr.name === name)
        if (p && p.implementation !== undefined) return p.implementation as unknown as T
        t = t.parent ?? undefined
      }
      return undefined
    },
    consume,
    whenAvailable,
    initialize,
    destroy,
    logger,
    getComponent: (type: string) => {
      const registry = (inject('sparkRegistry') as any) ?? defaultComponentRegistry
    const comp = registry.get(type)?.component
      return comp ? markRaw(comp) : undefined
    },
    isComponentRegistered: (type: string) => registry.has(type),
    getOrCreateNoopProvider: (name: string) => getOrCreateNoopProvider(name),
    getProviderFromGlobal: (name: string) => getGlobalProvider(name),
    connectCapability: (provider: CapabilityProvider, consumer: CapabilityConsumer, ctx: ComponentContext) => capabilityManager.connectCapability(provider, consumer, ctx),
    disconnectCapability: (provider: CapabilityProvider, consumer: CapabilityConsumer, ctx: ComponentContext) => capabilityManager.disconnectCapability(provider, consumer, ctx)
  }
}

