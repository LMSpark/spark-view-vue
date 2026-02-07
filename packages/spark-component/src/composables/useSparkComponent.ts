/**
 * useSparkComponent - 核心 Composable
 *
 * 唯一的组件开发 API，整合：
 * - 上下文创建与生命周期管理
 * - 能力提供与消费
 * - 事件系统
 * - 注册表访问
 *
 * 设计原则：
 * - 无 Manager 中间层（直接操作 context）
 * - 无全局单例依赖（通过 Vue DI 获取 registry）
 * - parent/children 关系通过 Vue provide/inject 自动建立
 */

import { reactive, computed, onMounted, onUnmounted, markRaw, inject, provide as vueProvide } from 'vue'
import { Logger, createEventProvider } from '@spark-view/spark-utils'
import type { EventProvider } from '@spark-view/spark-utils'
import { createCapabilityManager } from '../capability/CapabilityManager.js'
import type { ComponentContext, CapabilityProvider, CapabilityConsumer, ComponentRegistry } from '../core/types.js'
import { SPARK_REGISTRY_KEY } from '../core/types.js'

// 能力管理器（每个 composable 调用共享一个实例即可，无状态）
const capabilityManager = createCapabilityManager()

type Implementation = Record<string, unknown>

export interface UseSparkComponentReturn {
  /** 响应式组件上下文 */
  context: ComponentContext
  /** 可见性 */
  isVisible: { readonly value: boolean }
  /** 禁用状态 */
  isDisabled: { readonly value: boolean }
  /** 提供能力 */
  provide: (name: string | symbol, implementation?: Implementation) => void
  /** 提供事件能力 */
  provideEvents: (name?: string | symbol) => EventProvider
  /** 获取本地 provider */
  getProvider: (name: string | symbol) => CapabilityProvider | undefined
  /** 沿 parent 链查找 provider 实现 */
  getInheritedProvider: <T = unknown>(name: string | symbol, ctx?: ComponentContext) => T | undefined
  /** 消费能力 */
  consume: (name: string | symbol) => Implementation | null
  /** 消费事件能力 */
  consumeEvents: (name: string | symbol, handlers: Record<string, (...args: unknown[]) => void>) => EventProvider | null
  /** consume 别名 */
  use: (name: string | symbol) => Implementation | null
  /** 等待能力注册 */
  whenAvailable: (name: string | symbol) => Promise<CapabilityProvider>
  /** 生命周期 */
  initialize: () => void
  destroy: () => void
  /** 日志器 */
  logger: ReturnType<typeof Logger>
  /** 从注册表获取组件 */
  getComponent: (type: string) => unknown
  /** 检查组件是否注册 */
  isComponentRegistered: (type: string) => boolean
  /** 创建空 provider */
  getOrCreateNoopProvider: (name: string) => CapabilityProvider
  /** 上下文链 */
  getContextChain: () => ComponentContext[]
  /** 打印能力树 */
  printCapabilityTree: () => void
}

export function useSparkComponent<TConfig extends Partial<ComponentContext> & { type: string } = ComponentContext>(
  config: TConfig,
  options?: {
    registry?: ComponentRegistry
    parentContext?: ComponentContext
  }
): UseSparkComponentReturn {
  // 从 Vue DI 获取 parent context（由父组件 provide）
  const parentContext = options?.parentContext ?? inject<ComponentContext | undefined>('sparkParentContext', undefined)

  // 从 DI 获取注册表
  const registry = options?.registry ?? inject(SPARK_REGISTRY_KEY, undefined)

  // 创建上下文
  const ctxRaw: ComponentContext = {
    id: config.id ?? `spark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: config.type,
    parent: parentContext,
    children: [],
    props: config.props,
    state: {},
    providers: new Map<string, CapabilityProvider>(),
    consumers: new Map<string, CapabilityConsumer>()
  }

  const context = reactive(ctxRaw)

  // 建立父子关系
  if (parentContext?.children) {
    parentContext.children.push(context)
  }

  // 向下传递，子组件可通过 inject 获取
  vueProvide('sparkParentContext', context)

  const logger = Logger(`Spark:${config.type}`)

  // ========== 可见性/禁用状态 ==========

  const isVisible = computed(() => (config as Record<string, unknown>).visible !== false)
  const isDisabled = computed(() => (config as Record<string, unknown>).disabled === true)

  // ========== 能力提供 ==========

  function provide(name: string | symbol, implementation?: Implementation): void {
    const nameKey = typeof name === 'symbol' ? name.toString() : name
    const provider: CapabilityProvider = { name: nameKey, implementation }
    capabilityManager.registerProvider(context, provider)
    logger.info(`🔌 Provided: ${nameKey}`)
  }

  function provideEvents(name: string | symbol = 'events'): EventProvider {
    const nameKey = typeof name === 'symbol' ? name.toString() : name
    const { provider, emitter } = createEventProvider(nameKey)
    capabilityManager.registerProvider(context, provider)
    logger.info(`🎉 Provided events: ${nameKey}`)
    return emitter
  }

  // ========== 能力消费 ==========

  function consume(name: string | symbol): Implementation | null {
    const nameKey = typeof name === 'symbol' ? name.toString() : name
    const consumer: CapabilityConsumer = { capabilityName: nameKey, implementation: undefined }
    capabilityManager.registerConsumer(context, consumer)

    const provider = capabilityManager.getProvider(context, nameKey)
    if (provider) {
      consumer.implementation = provider.implementation
      logger.info(`🔌 Consumed: ${nameKey}`)
      return (provider.implementation ?? null) as Implementation | null
    }

    logger.warn(`⚠️ Capability not found (late-binding): ${nameKey}`)
    return null
  }

  function consumeEvents(
    name: string | symbol,
    handlers: Record<string, (...args: unknown[]) => void>
  ): EventProvider | null {
    const nameKey = typeof name === 'symbol' ? name.toString() : name
    const provider = capabilityManager.getProvider(context, nameKey)
    if (provider) {
      const emitter = provider.implementation as EventProvider
      Object.entries(handlers).forEach(([event, handler]) => {
        emitter.on(event, handler)
      })
      logger.info(`🎉 Consumed events: ${nameKey}`)
      return emitter
    }
    logger.warn(`⚠️ Event capability not found: ${nameKey}`)
    return null
  }

  // ========== 能力查找 ==========

  function getProvider(name: string | symbol): CapabilityProvider | undefined {
    const nameKey = typeof name === 'symbol' ? name.toString() : name
    return context.providers.get(nameKey)
  }

  function getInheritedProvider<T = unknown>(name: string | symbol, ctx?: ComponentContext): T | undefined {
    const nameKey = typeof name === 'symbol' ? name.toString() : name
    let current: ComponentContext | undefined = ctx ?? context
    while (current) {
      const p = current.providers.get(nameKey)
      if (p?.implementation !== undefined) return p.implementation as T
      current = current.parent
    }
    return undefined
  }

  function whenAvailable(name: string | symbol): Promise<CapabilityProvider> {
    const nameKey = typeof name === 'symbol' ? name.toString() : name
    const existing = capabilityManager.getProvider(context, nameKey)
    if (existing) return Promise.resolve(existing)

    return new Promise((resolve, reject) => {
      context.providerListeners = context.providerListeners ?? new Map()
      if (!context.providerListeners.has(nameKey)) context.providerListeners.set(nameKey, new Set())
      const listeners = context.providerListeners.get(nameKey)
      if (!listeners) {
        reject(new Error(`Failed to create listeners for capability: ${nameKey}`))
        return
      }
      const cb = (prov: CapabilityProvider) => {
        listeners.delete(cb)
        resolve(prov)
      }
      listeners.add(cb)
    })
  }

  // ========== 注册表访问 ==========

  function getComponent(type: string): unknown {
    if (!registry) return undefined
    const def = registry.get(type)
    return def?.component ? markRaw(def.component) : undefined
  }

  function isComponentRegistered(type: string): boolean {
    return registry?.has(type) ?? false
  }

  // ========== 生命周期 ==========

  const initialize = () => logger.info(`🚀 Init: ${context.type} (${context.id})`)

  const destroy = () => {
    // 从父 children 中移除
    if (parentContext?.children) {
      const idx = parentContext.children.indexOf(context)
      if (idx !== -1) parentContext.children.splice(idx, 1)
    }
    context.providers.clear()
    context.consumers.clear()
    logger.info(`🗑️ Destroyed: ${context.type} (${context.id})`)
  }

  onMounted(() => {
    initialize()
  })

  onUnmounted(() => {
    destroy()
  })

  // 默认提供 sparkContext 能力
  provide('sparkContext', context as unknown as Implementation)

  // ========== 调试工具 ==========

  function getContextChain(): ComponentContext[] {
    const chain: ComponentContext[] = []
    let current: ComponentContext | undefined = context
    while (current) {
      chain.push(current)
      current = current.parent
    }
    return chain
  }

  function printCapabilityTree(): void {
    const print = (ctx: ComponentContext, indent = 0) => {
      const prefix = '  '.repeat(indent)
      const providers = Array.from(ctx.providers.keys()).join(', ')
      logger.info(`${prefix}├─ ${ctx.type} (${ctx.id})`)
      if (providers) logger.info(`${prefix}   Provides: [${providers}]`)
      ctx.children?.forEach(child => print(child, indent + 1))
    }

    let root: ComponentContext = context
    while (root.parent) root = root.parent
    logger.info('🌲 Capability Tree:')
    print(root)
  }

  return {
    context,
    isVisible,
    isDisabled,
    provide,
    provideEvents,
    getProvider,
    getInheritedProvider,
    consume,
    consumeEvents,
    use: consume,
    whenAvailable,
    initialize,
    destroy,
    logger,
    getComponent,
    isComponentRegistered,
    getOrCreateNoopProvider: (name: string) => ({ name, implementation: {} }),
    getContextChain,
    printCapabilityTree
  }
}
