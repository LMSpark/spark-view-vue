/**
 * useSparkComponent - SPARK 组件核心 Composable
 *
 * 提供组件上下文管理、能力系统（provide/consume）、事件系统和生命周期控制。
 *
 * @module composables/useSparkComponent
 */

import { reactive, computed, onMounted, onUnmounted, markRaw, inject, provide as vueProvide } from 'vue'
import { provide as setCapability, lookup, createEventEmitter } from '@spark-view/spark-utils'
import type { IEventEmitter, CapabilityKey, CapabilityName, LoggerApi } from '@spark-view/spark-utils'
import type { ComponentContext, ComponentConfig, ComponentRegistry } from '../core/types.js'
import { SPARK_REGISTRY_KEY, SPARK_PARENT_CONTEXT_KEY } from '../core/types.js'

/* -------------------------------------------------------------------------- */

/** useSparkComponent 返回值接口 */
export interface UseSparkComponentReturn {
  /** 响应式组件上下文 */
  context: ComponentContext
  /** 可见性（基于 config.visible，默认 true） */
  isVisible: { readonly value: boolean }
  /** 禁用状态（基于 config.disabled，默认 false） */
  isDisabled: { readonly value: boolean }

  /** 提供能力实现（支持 CapabilityKey<T> 类型推断） */
  provide: {
    <T>(name: CapabilityKey<T>, implementation: T): void
    (name: string | symbol, implementation?: unknown): void
  }
  /** 提供事件能力，返回 EventEmitter */
  provideEvents: (name?: string | symbol) => IEventEmitter
  /** 获取当前 context 的本地能力（不向父级查找） */
  getProvider: (name: string | symbol) => unknown

  /** 消费能力（沿 parent 链向上查找） */
  consume: {
    <T>(name: CapabilityKey<T>): T | null
    (name: string | symbol): unknown
  }
  /** 消费事件能力并批量绑定处理器 */
  consumeEvents: (name: string | symbol, handlers: Record<string, (...args: unknown[]) => void>) => IEventEmitter | null

  /** 初始化（onMounted 自动调用） */
  initialize: () => void
  /** 清理（onUnmounted 自动调用） */
  destroy: () => void

  /** 日志器（带 type 前缀） */
  logger: LoggerApi
  /** 从注册表获取组件（markRaw 包装） */
  getComponent: (type: string) => unknown
  /** 检查组件是否已注册 */
  isComponentRegistered: (type: string) => boolean
}

/* -------------------------------------------------------------------------- */

/**
 * SPARK 组件核心 Composable
 *
 * 每个 SPARK 组件在 setup 中调用一次，获得上下文、能力管理和生命周期控制。
 */
export function useSparkComponent<TConfig extends ComponentConfig = ComponentConfig>(
  config: TConfig,
  options?: {
    registry?: ComponentRegistry
    parentContext?: ComponentContext
  }
): UseSparkComponentReturn {

  // ── 依赖注入 ──

  const parentContext = options?.parentContext ?? inject(SPARK_PARENT_CONTEXT_KEY, undefined)
  const registry = options?.registry ?? inject(SPARK_REGISTRY_KEY, undefined)

  // ── 上下文创建 ──

  const ctxRaw = reactive({
    id: config.id ?? `spark-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
    type: config.type,
    children: [],
    props: config.props ?? {},
    state: {},
    capabilities: new Map<CapabilityName, unknown>(),
    parent: undefined,
    logger: undefined
  } as unknown as ComponentContext)

  if (parentContext !== undefined) {
    ctxRaw.parent = parentContext
  }

  const context: ComponentContext = reactive(ctxRaw)

  // 建立父子关系
  if (parentContext?.children) {
    parentContext.children.push(context)
  }

  // 向子组件提供当前 context
  vueProvide(SPARK_PARENT_CONTEXT_KEY, context)

  // ── Logger（从能力链查找，fallback 到 console） ──

  const fallbackLogger: LoggerApi = {
    debug: () => undefined,
    info: (...args: unknown[]) => console.info(...args),
    warn: (...args: unknown[]) => console.warn(...args),
    error: (...args: unknown[]) => console.error(...args)
  }

  let cachedLogger: LoggerApi | null = null

  const getActiveLogger = (): LoggerApi => {
    if (cachedLogger) return cachedLogger
    const impl = lookup<LoggerApi>(context, 'logger')
    if (impl && typeof impl === 'object' && 'info' in impl && 'warn' in impl && 'error' in impl && 'debug' in impl) {
      cachedLogger = impl
      return impl
    }
    return fallbackLogger
  }

  const logger: LoggerApi = {
    debug: (...args: unknown[]) => getActiveLogger().debug(...args),
    info: (...args: unknown[]) => getActiveLogger().info(...args),
    warn: (...args: unknown[]) => getActiveLogger().warn(...args),
    error: (...args: unknown[]) => getActiveLogger().error(...args)
  }

  context.logger = logger

  // ── 计算属性 ──

  const isVisible = computed(() => config.visible !== false)
  const isDisabled = computed(() => config.disabled === true)

  // ── 能力提供 ──

  function provide(name: string | symbol, implementation?: unknown): void {
    setCapability(context, name, implementation)
    logger.info(`🔌 Provided: ${String(name)}`)
  }

  function provideEvents(name: string | symbol = 'events'): IEventEmitter {
    const emitter = createEventEmitter()
    setCapability(context, name, emitter)
    logger.info(`🎉 Provided events: ${String(name)}`)
    return emitter
  }

  // ── 能力消费 ──

  function consume(name: string | symbol): unknown {
    const impl = lookup(context, name)
    if (impl !== undefined) {
      logger.info(`🔌 Consumed: ${String(name)}`)
      return impl
    }
    logger.warn(`⚠️ Capability not found (late-binding): ${String(name)}`)
    return null
  }

  function consumeEvents(
    name: string | symbol,
    handlers: Record<string, (...args: unknown[]) => void>
  ): IEventEmitter | null {
    const emitter = lookup<IEventEmitter>(context, name)
    if (emitter) {
      Object.entries(handlers).forEach(([event, handler]) => {
        emitter.on(event, handler)
      })
      logger.info(`🎉 Consumed events: ${String(name)}`)
      return emitter
    }
    logger.warn(`⚠️ Event capability not found: ${String(name)}`)
    return null
  }

  // ── 能力查找 ──

  function getProvider(name: string | symbol): unknown {
    return context.capabilities.get(name)
  }

  // ── 注册表访问 ──

  function getComponent(type: string): unknown {
    if (!registry) return undefined
    const def = registry.get(type)
    return def?.component ? markRaw(def.component) : undefined
  }

  function isComponentRegistered(type: string): boolean {
    return registry?.has(type) ?? false
  }

  // ── 生命周期 ──

  const initialize = () => logger.info(`🚀 Init: ${context.type} (${context.id})`)

  const destroy = () => {
    if (parentContext?.children) {
      const idx = parentContext.children.indexOf(context)
      if (idx !== -1) parentContext.children.splice(idx, 1)
    }
    context.capabilities.clear()
    logger.info(`🗑️ Destroyed: ${context.type} (${context.id})`)
  }

  onMounted(() => initialize())
  onUnmounted(() => destroy())

  // ── 返回值 ──

  return {
    context,
    isVisible,
    isDisabled,
    provide,
    provideEvents,
    getProvider,
    consume,
    consumeEvents,
    initialize,
    destroy,
    logger,
    getComponent,
    isComponentRegistered
  }
}
