/**
 * useSparkComponent - SPARK 组件核心 Composable
 *
 * 提供组件上下文管理、能力系统（provide/consume）、事件系统和生命周期控制。
 *
 * @module composables/useSparkComponent
 */

import { shallowReactive, computed, onMounted, onUnmounted, markRaw, inject, provide as vueProvide } from 'vue'
import { provide as setCapability, lookup, normalizeKey, createEventEmitter, APP_SERVICES, LOGGER } from '@spark-view/spark-utils'
import type { IEventEmitter, CapabilityKey, CapabilityName, CapabilityTypeMap, LoggerApi, IAppServicesCapability } from '@spark-view/spark-utils'
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

  /**
   * 提供能力实现。
   *
   * 重载顺序（TypeScript 按最具体优先匹配）：
   * 1. `CapabilityTypeMap` 字符串键 → 对应类型（declaration merging 可扩展）
   * 2. `CapabilityKey<T>` 符号键 → 类型推断
   * 3. 任意 string | symbol → unknown（fallback）
   */
  provide: {
    <K extends keyof CapabilityTypeMap>(name: K, implementation: CapabilityTypeMap[K]): void
    <T>(name: CapabilityKey<T>, implementation: T): void
    (name: string | symbol, implementation?: unknown): void
  }
  /** 提供事件能力，返回 EventEmitter */
  provideEvents: (name?: string | symbol) => IEventEmitter
  /** 获取当前 context 的本地能力（不向父级查找） */
  getProvider: (name: string | symbol) => unknown

  /**
   * 消费能力（沿 parent 链向上查找，未找到返回 null）。
   *
   * 重载顺序：
   * 1. `CapabilityTypeMap` 字符串键 → 对应类型 | null（无需 import 符号对象）
   * 2. `CapabilityKey<T>` 符号键 → T | null
   * 3. 任意 string | symbol → unknown（fallback）
   *
   * @example
   * // 按字符串名称消费，类型来自 CapabilityTypeMap declaration merging
   * const sel = consume('spark:capability:selection')
   * // sel: ISelectionCapability | null
   */
  consume: {
    <K extends keyof CapabilityTypeMap>(name: K): CapabilityTypeMap[K] | null
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

/** 全局单调递增 ID 计数器，替代 Date.now()+random（更快、确定、SSR 友好） */
let _idCounter = 0

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
  //
  // 优化：
  // 1. shallowReactive 替代 reactive：顶层字段响应式，子对象不做深层代理
  // 2. capabilities / children 用 markRaw，完全脱离 Vue 响应系统：
  //    capabilities 只做命令式 Map.get/set，children 只在 destroy 时 indexOf
  // 3. id 用全局单调计数器，比 Date.now()+random 更快且确定（SSR 友好）

  const context: ComponentContext = shallowReactive({
    id: config.id ?? `spark-${++_idCounter}`,
    type: config.type,
    children: markRaw([] as ComponentContext[]),
    props: config.props ?? {},
    state: {},
    capabilities: markRaw(new Map<CapabilityName, unknown>()),
    parent: parentContext,
    logger: undefined
  } as unknown as ComponentContext)

  // 建立父子关系（父 children 是 markRaw 数组，无响应式开销）
  if (parentContext?.children) {
    parentContext.children.push(context)
  }

  // 向子组件提供当前 context
  vueProvide(SPARK_PARENT_CONTEXT_KEY, context)

  // ── Logger（从能力链查找，带一次性缓存） ──
  //
  // 缓存策略：首次成功 lookup 后缓存结果，避免每次日志调用都遍历 parent 链。
  // 失效时机：调用 provide(LOGGER, ...) 或 provide(APP_SERVICES, ...) 时主动置 null。
  // Late-binding 边界：父组件在 onMounted 中 provide(LOGGER) 时，
  // 若本组件的 provide() 未被触发则缓存不失效（已被这个父 provide 填充的子组件不受影响）。
  // 对于典型使用场景（setup 期间提供能力）此策略覆盖 100%；极端晚绑定下退化为重查一次。

  const fallbackLogger: LoggerApi = {
    debug: () => undefined,
    info: (...args: unknown[]) => console.info(...args),
    warn: (...args: unknown[]) => console.warn(...args),
    error: (...args: unknown[]) => console.error(...args)
  }

  let _loggerCache: LoggerApi | null = null

  const resolveLogger = (): LoggerApi => {
    if (_loggerCache !== null) return _loggerCache
    // 1. 优先查找 LOGGER 能力键（最近祖先覆盖，实现组件子树级日志替换）
    const loggerImpl = lookup<LoggerApi>(context, LOGGER)
    if (loggerImpl && typeof loggerImpl === 'object' && 'info' in loggerImpl) {
      _loggerCache = loggerImpl
      return loggerImpl
    }
    // 2. 次选 APP_SERVICES.logger（应用层统一提供）
    const appServices = lookup<IAppServicesCapability>(context, APP_SERVICES)
    if (appServices?.logger) {
      _loggerCache = appServices.logger
      return appServices.logger
    }
    // fallback 不缓存：保留重查机会（等待父级 provide）
    return fallbackLogger
  }

  const logger: LoggerApi = {
    debug: (...args: unknown[]) => resolveLogger().debug(...args),
    info:  (...args: unknown[]) => resolveLogger().info(...args),
    warn:  (...args: unknown[]) => resolveLogger().warn(...args),
    error: (...args: unknown[]) => resolveLogger().error(...args)
  }

  context.logger = logger

  // ── 计算属性 ──

  const isVisible = computed(() => config.visible !== false)
  const isDisabled = computed(() => config.disabled === true)

  // ── 能力提供 ──

  function provide(name: string | symbol, implementation?: unknown): void {
    setCapability(context, name, implementation)
    // 当 LOGGER 或 APP_SERVICES 被更新时，使 logger 缓存失效
    const key = normalizeKey(name)
    if (key === LOGGER || key === APP_SERVICES) {
      _loggerCache = null
    }
    if (import.meta.env.DEV) {
      logger.debug(`[spark] provided: ${String(name)}`)
    }
  }

  function provideEvents(name: string | symbol = 'events'): IEventEmitter {
    const emitter = createEventEmitter()
    setCapability(context, name, emitter)
    return emitter
  }

  // ── 事件订阅追踪（防止内存泄漏） ──

  const _eventSubscriptions: Array<{ emitter: IEventEmitter; event: string; handler: (...args: unknown[]) => void }> = []

  // ── 能力消费 ──

  function consume(name: string | symbol): unknown {
    const impl = lookup(context, name)
    if (impl !== undefined) return impl
    if (import.meta.env.DEV) {
      logger.debug(`[spark] capability not found (late-binding ok): ${String(name)}`)
    }
    return null
  }

  function consumeEvents(
    name: string | symbol,
    handlers: Record<string, (...args: unknown[]) => void>
  ): IEventEmitter | null {
    const emitter = lookup<IEventEmitter>(context, name)
    if (emitter) {
      for (const [event, handler] of Object.entries(handlers)) {
        emitter.on(event, handler)
        _eventSubscriptions.push({ emitter, event, handler })
      }
      return emitter
    }
    if (import.meta.env.DEV) {
      logger.debug(`[spark] event capability not found: ${String(name)}`)
    }
    return null
  }

  // ── 能力查找 ──

  function getProvider(name: string | symbol): unknown {
    return context.capabilities.get(normalizeKey(name))
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

  const initialize = () => {
    if (import.meta.env.DEV) {
      logger.debug(`[spark] init: ${context.type} (${context.id})`)
    }
  }

  const destroy = () => {
    // 清理所有通过 consumeEvents 注册的事件监听（防止内存泄漏）
    for (const sub of _eventSubscriptions) {
      sub.emitter.off(sub.event, sub.handler)
    }
    _eventSubscriptions.length = 0

    if (parentContext?.children) {
      const idx = parentContext.children.indexOf(context)
      if (idx !== -1) parentContext.children.splice(idx, 1)
    }
    context.capabilities.clear()
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
