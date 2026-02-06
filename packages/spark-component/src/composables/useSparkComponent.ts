/**
 * useSparkComponent composable
 * 为组件提供能力系统集成
 * 
 * 注意：此文件使用类型断言桥接 ComponentContext 和基础能力系统
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { reactive, computed, onMounted, onUnmounted, markRaw, inject, provide as vueProvide } from 'vue'
import {
  Logger,
  Capability
} from '@spark-view/spark-utils'
import type { EventProvider } from '@spark-view/spark-utils'
import { capabilityManager as defaultCapabilityManager } from '../capability/ComponentCapabilityManager.js'
import type { ComponentContext, CapabilityProvider, CapabilityConsumer, ComponentManager, ComponentRegistry } from '../types/spark-component.js'
import { SPARK_MANAGER_KEY, SPARK_REGISTRY_KEY } from '../types/spark-component.js'
import type { Implementation } from '../types/common.js'

// Local helper to create a noop provider when a capability is missing. This avoids any global registry side-effects.
function createNoopProvider(name: string): CapabilityProvider {
  return { name, version: '0.0.0', implementation: {} }
}

export function useSparkComponent<TConfig extends ComponentContext = ComponentContext>(
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
  provideEvents: (name?: string) => EventProvider
  getProvider: (name: string) => CapabilityProvider | undefined
  getInheritedProvider: <T = unknown>(name: string, ctx?: ComponentContext) => T | undefined
  consume: (name: string) => Implementation | null
  consumeEvents: (name: string, handlers: Record<string, (...args: unknown[]) => void>) => EventProvider | null
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
  
  // 能力树管理
  getContextChain: () => ComponentContext[]
  printCapabilityTree: () => void
} {
  // 优先使用 options.parentContext，否则从 inject 获取（页面级根上下文作为 fallback）
  const parentContext = options?.parentContext ?? inject<ComponentContext | undefined>('sparkParentContext', undefined)

  const ctxRaw: ComponentContext = {
    id: config.id ?? `spark-${Date.now()}-${Math.random().toString(36).substr(2,9)}`,
    type: config.type,
    parent: parentContext,
    children: [],
    // 将原始配置存入 state
    state: { ...config },
    providers: new Map<string, CapabilityProvider>(),
    consumers: new Map<string, CapabilityConsumer>()
  }

  const context = reactive(ctxRaw)
  
  // 维护能力树：自动将自己注册到父上下文
  if (parentContext?.children) {
    parentContext.children.push(context)
  }
  
  // 通过 Vue provide 自动传递 context 给子组件（递归渲染友好）
  vueProvide('sparkParentContext', context)
  
  const logger = Logger(`Spark:${config.type}`)

  // Resolve manager via explicit option or DI (Symbol-based); fail fast to enforce DI-first design
  const resolvedManager = options?.manager ?? (inject(SPARK_MANAGER_KEY)) ?? (inject('sparkManager'))
  if (!resolvedManager) throw new Error('Component manager not found. Either provide via options.manager or install Spark Vue plugin: app.use(Spark.createVuePlugin())')
  const manager = resolvedManager
  
  // Get capabilityManager from manager if available, fallback to global singleton
  const capabilityManager = (typeof (manager as { getCapabilityManager?: () => unknown }).getCapabilityManager === 'function')
    ? (manager as { getCapabilityManager: () => unknown }).getCapabilityManager() as typeof defaultCapabilityManager
    : defaultCapabilityManager

  const isVisible = computed(() => {
    const visibleProp = (context.state as { visible?: boolean }).visible
    return visibleProp !== false
  })
  const isDisabled = computed(() => {
    const disabledProp = (context.state as { disabled?: boolean }).disabled
    return disabledProp === true
  })

  const initialize = () => logger.info(`🚀 Initializing SPARK component: ${context.type} (${context.id})`)
  const destroy = () => {
    logger.info(`🗑️ Destroying SPARK component: ${context.type} (${context.id})`)
    
    // 从父上下文的 children 中移除自己
    if (parentContext?.children) {
      const index = parentContext.children.indexOf(context)
      if (index !== -1) {
        parentContext.children.splice(index, 1)
      }
    }
    
    context.providers.clear()
    context.consumers.clear()
    try { manager && typeof (manager).destroyContext === 'function' && (manager).destroyContext(context.id) } catch (e: unknown) { logger.warn('Failed to destroy context via manager', String(e)) }
  }

  function getProvider(name: string): CapabilityProvider | undefined {
    return context.providers.get(name)
  }

  // Provide a capability on this context
  function provide(name: string, implementation?: Implementation) {
    const p: CapabilityProvider = { name, version: '1.0.0', implementation }
    if (manager && typeof (manager).registerProvider === 'function') (manager).registerProvider(context, p)
    else context.providers.set(name, p)
    logger.info(`🔌 Provided capability: ${name} for ${context.type} (${context.id})`)
  }

  // Provide event capability - convenient wrapper
  function provideEvents(name = 'events'): EventProvider {
    const { provider, emitter } = Capability.Events.createProvider(name)
    if (manager && typeof (manager).registerProvider === 'function') {
      (manager).registerProvider(context, provider)
    } else {
      context.providers.set(provider.name, provider)
    }
    logger.info(`🎉 Provided event capability: ${name} for ${context.type} (${context.id})`)
    return emitter
  }

  function consume(name: string): Implementation | null {
    const consumer: CapabilityConsumer = { capabilityName: name, implementation: undefined }
    context.consumers.set(name, consumer)
    const provider = manager.getProvider(context, name) ?? createNoopProvider(name)
    if (provider) {
      consumer.implementation = ((provider).implementation ?? (provider as unknown as Implementation)) as Implementation | undefined
      try { capabilityManager.connectCapability(provider, consumer, context as import('@spark-view/spark-utils').CapabilityContext<CapabilityProvider>) } catch (e: unknown) { logger.warn('autoConnectCapabilities failed', String(e)) }
      logger.info(`🔌 Consumed capability: ${name} for ${context.type} (${context.id})`)
      return (consumer.implementation ?? null) as Implementation | null
    }
    logger.warn(`⚠️ Capability not found (registered consumer for late-binding): ${name} for ${context.type} (${context.id})`)
    return null
  }

  // Consume event capability - convenient wrapper
  function consumeEvents(
    name: string,
    handlers: Record<string, (...args: unknown[]) => void>
  ): EventProvider | null {
    const consumer = Capability.Events.createConsumer(name, handlers)
    context.consumers.set(name, consumer)
    
    const provider = manager.getProvider(context, name)
    if (provider) {
      consumer.implementation = provider.implementation
      try {
        capabilityManager.connectCapability(provider, consumer, context as import('@spark-view/spark-utils').CapabilityContext<CapabilityProvider>)
        logger.info(`🎉 Consumed event capability: ${name} for ${context.type} (${context.id})`)
        return provider.implementation as EventProvider
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
        const p = t.providers.get(name)
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
    
    // 获取从当前节点到根的上下文链路
    getContextChain: () => {
      const chain: ComponentContext[] = []
      let current: ComponentContext | undefined = context
      while (current) {
        chain.push(current)
        current = current.parent ?? undefined
      }
      return chain
    },
    
    // 打印完整能力树结构
    printCapabilityTree: () => {
      const printTree = (ctx: ComponentContext, indent = 0) => {
        const prefix = '  '.repeat(indent)
        const providers = Array.from(ctx.providers.keys()).join(', ')
        logger.info(`${prefix}├─ ${ctx.type} (${ctx.id})`)
        if (providers) {
          logger.info(`${prefix}   Provides: [${providers}]`)
        }
        ctx.children?.forEach(child => printTree(child, indent + 1))
      }
      
      // 找到根节点
      let root: ComponentContext = context
      while (root.parent) root = root.parent
      
      logger.info('🌲 Capability Tree:')
      printTree(root)
    },
    
    getOrCreateNoopProvider: (name: string) => createNoopProvider(name),
    connectCapability: (provider: CapabilityProvider, consumer: CapabilityConsumer, ctx: ComponentContext) => capabilityManager.connectCapability(provider, consumer, ctx as import('@spark-view/spark-utils').CapabilityContext<CapabilityProvider>),
    disconnectCapability: (provider: CapabilityProvider, consumer: CapabilityConsumer, ctx: ComponentContext) => capabilityManager.disconnectCapability(provider, consumer, ctx as import('@spark-view/spark-utils').CapabilityContext<CapabilityProvider>)
  }
}

