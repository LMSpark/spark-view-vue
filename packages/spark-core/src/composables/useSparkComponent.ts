import { reactive, computed, inject, provide, onMounted, onUnmounted } from 'vue'
import { getGlobalSparkComponentManager } from '../utils/SparkComponentManager.js'
import { Logger } from '../utils/logger.js'
import { getOrCreateNoopProvider, getGlobalProvider } from '../utils/GlobalProviderRegistry.js'
import { connectCapability, disconnectCapability } from '../utils/SparkCapabilitySystem.js'
import type { SparkComponentConfig, SparkComponentContext, SparkCapabilityProvider, SparkCapabilityConsumer } from '../types/spark-component.js'

export function useSparkComponent(props: { config: SparkComponentConfig, parentContext?: SparkComponentContext }) {
  const ctxRaw: SparkComponentContext = {
    id: props.config.id || `spark-${Date.now()}-${Math.random().toString(36).substr(2,9)}`,
    type: props.config.type,
    parent: props.parentContext,
    children: [],
    config: props.config,
    state: {},
    providers: new Set<SparkCapabilityProvider>(),
    consumers: new Map<string, SparkCapabilityConsumer>()
  }

  const context = reactive(ctxRaw)
  const logger = Logger(context)
  const manager = getGlobalSparkComponentManager()

  const isVisible = computed(() => props.config.visible !== false)
  const isDisabled = computed(() => props.config.disabled === true)

  const initialize = () => logger.info(`🚀 Initializing SPARK component: ${context.type} (${context.id})`)
  const destroy = () => {
    logger.info(`🗑️ Destroying SPARK component: ${context.type} (${context.id})`)
    context.providers.clear()
    context.consumers.clear()
    try { manager && typeof manager.destroyContext === 'function' && manager.destroyContext(context.id) } catch (e) { logger.warn('Failed to destroy context via manager', String(e)) }
  }

  function getProvider(name: string) {
    for (const p of Array.from(context.providers)) if (p.name === name) return p
    return undefined
  }

  function registerProvider(name: string, implementation: unknown) {
    const p: SparkCapabilityProvider = { name, version: '1.0.0', interface: {}, implementation }
    if (manager && typeof manager.registerProvider === 'function') manager.registerProvider(context, p)
    else context.providers.add(p)
    logger.info(`🔌 Registered provider: ${name} for ${context.type} (${context.id})`)
  }

  function consumeCapability(name: string) {
    const consumer: SparkCapabilityConsumer = { capabilityName: name, interface: {}, implementation: {} }
    context.consumers.set(name, consumer)
    const provider = getProvider(name) || getGlobalProvider(name) || getOrCreateNoopProvider(name)
    if (provider) {
      consumer.implementation = (provider as any).implementation || provider
      try { connectCapability(provider, consumer, context) } catch (e) { logger.warn('autoConnectCapabilities failed', String(e)) }
      logger.info(`🔌 Consumed capability: ${name} for ${context.type} (${context.id})`)
      return consumer.implementation
    }
    logger.warn(`⚠️ Capability not found (registered consumer for late-binding): ${name} for ${context.type} (${context.id})`)
    return null
  }

  function whenProviderAvailable(name: string): Promise<SparkCapabilityProvider> {
    const p = getProvider(name)
    if (p) return Promise.resolve(p)
    return new Promise(resolve => {
      context.providerListeners = context.providerListeners || new Map()
      if (!context.providerListeners.has(name)) context.providerListeners.set(name, new Set())
      const set = context.providerListeners.get(name)!
      const cb = (prov: SparkCapabilityProvider) => { set.delete(cb); resolve(prov) }
      set.add(cb)
    })
  }

  onMounted(() => {
    initialize()
    const mgr = manager
    if (!mgr) throw new Error('sparkManager not found. Ensure `app.provide("sparkManager", getGlobalSparkComponentManager())` is called in application entry.')
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
    registerProvider,
    getProvider,
    getInheritedCapability: (name: string) => getProvider(name),
    consumeCapability,
    whenProviderAvailable,
    GetProvider: <T = unknown>(name: string, ctx?: SparkComponentContext) => {
      let t = ctx || context
      while (t) {
        const p = Array.from(t.providers).find(pr => pr.name === name)
        if (p) return (p as any).implementation as T
        t = t.parent as any
      }
      return undefined
    },
    initialize,
    destroy,
    logger,
    getSparkComponent: (type: string) => undefined,
    isComponentRegistered: (type: string) => false,
    getOrCreateNoopProvider: (name: string) => getOrCreateNoopProvider(name),
    registerGlobalProvider: (name: string, provider: SparkCapabilityProvider) => { /* delegate */ },
    getGlobalProvider: (name: string) => getGlobalProvider(name),
    connectCapability: (provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer, ctx: SparkComponentContext) => connectCapability(provider, consumer, ctx),
    disconnectCapability: (provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer, ctx: SparkComponentContext) => disconnectCapability(provider, consumer, ctx)
  }
}
