/**
 * useSparkComponent - SPARK 组件核心 Composable
 *
 * 提供组件上下文管理、能力系统（sparkProvide/sparkConsume）、事件系统和生命周期控制。
 *
 * @module composables/useSparkComponent
 */

import { computed, onMounted, onUnmounted, inject, provide as vueProvide, getCurrentInstance, markRaw } from 'vue'
import { sparkProvide as rawSparkProvide, sparkConsume as rawSparkConsume, normalizeKey, createEventEmitter, APP_SERVICES, LOGGER } from '@spark-view/spark-utils'
import type { IEventEmitter, CapabilityKey, CapabilityName, CapabilityTypeMap, LoggerApi, IAppServicesCapability } from '@spark-view/spark-utils'
import type { SparkCapabilityContext, SparkNode, ComponentRegistry } from './types.js'
import { SPARK_REGISTRY_KEY, nodeId, nodeInputProp, normalizeSparkNode } from './types.js'
import { INTERNAL_PARENT_CAPABILITY_CONTEXT_KEY } from './internal-context.js'
import { PAGE_COMPONENT_REGISTRY } from './capability-keys.js'
import type { PageComponentRegistry } from './capability-keys.js'

/* -------------------------------------------------------------------------- */

/** useSparkComponent 返回值接口 */
export interface UseSparkComponentReturn {
  /** 纯能力上下文 */
  context: SparkCapabilityContext
  /** 父能力上下文；子组件应优先通过该字段获取父级，而非直接读取 context.parent */
  parentContext: SparkCapabilityContext | null
  /** 父组件类型；无父级时为 null */
  parentType: string | null
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
  sparkProvide: {
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
  * const svc = sparkConsume('spark:capability:app-services')
   * // svc: IAppServicesCapability | null
   */
  sparkConsume: {
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
  /** 向 PageComponentRegistry 注册组件 API（cleanup 由 destroy 自动处理） */
  registerApi: (api: unknown) => void
}

/** 轻量能力消费结果 */
export interface UseSparkCapabilityReaderReturn {
  /** 最近父级能力上下文 */
  parentContext: SparkCapabilityContext | null
  /** 最近父级的组件类型 */
  parentType: string | null
  sparkConsume: {
    <K extends keyof CapabilityTypeMap>(name: K): CapabilityTypeMap[K] | null
    <T>(name: CapabilityKey<T>): T | null
    (name: string | symbol): unknown
  }
}

export interface UseSparkComponentOptions {
  registry?: ComponentRegistry
  parentContext?: SparkCapabilityContext
  mode?: 'full' | 'consume-only'
}

/* -------------------------------------------------------------------------- */

/**
 * SPARK 组件核心 Composable
 *
 * 每个 SPARK 组件在 setup 中调用一次，获得上下文、能力管理和生命周期控制。
 */

/** 全局单调递增 ID 计数器，替代 Date.now()+random（更快、确定、SSR 友好） */
let _idCounter = 0

function isVueListenerProp(key: string): boolean {
  return /^on[A-Z]/.test(key) || key === 'on'
}

function isVueInternalVNodeProp(key: string): boolean {
  return key === 'key'
    || key === 'ref'
    || key === 'ref_for'
    || key === 'ref_key'
    || key.startsWith('onVnode')
}

function readRuntimeVNodeProps(instance: ReturnType<typeof getCurrentInstance>): Record<string, unknown> {
  const rawProps = instance?.vnode.props
  if (!rawProps || typeof rawProps !== 'object') return {}

  const runtimeProps: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rawProps)) {
    if (isVueInternalVNodeProp(key) || isVueListenerProp(key)) continue
    runtimeProps[key] = value
  }
  return runtimeProps
}

function buildEffectiveConfig(instance: ReturnType<typeof getCurrentInstance>, fallbackConfig?: SparkNode): SparkNode {
  const runtimeProps = readRuntimeVNodeProps(instance)
  const base = fallbackConfig === undefined
    ? ({ type: 'unknown' } as SparkNode & Record<string, unknown>)
    : ({ ...fallbackConfig } as SparkNode & Record<string, unknown>)

  if (Object.keys(runtimeProps).length > 0) {
    base.props = base.props === undefined
      ? runtimeProps
      : { ...base.props, ...runtimeProps }
  }

  const runtimeId = typeof runtimeProps['id'] === 'string' ? runtimeProps['id'] : undefined
  if (base.id === undefined && runtimeId !== undefined) {
    base.id = runtimeId
  }

  return normalizeSparkNode(base, 'unknown')
}

function resolveParentAccess(overrideParentContext?: SparkCapabilityContext): Omit<UseSparkCapabilityReaderReturn, 'sparkConsume'> {
  const parentContext = inject(INTERNAL_PARENT_CAPABILITY_CONTEXT_KEY, null)
  const resolvedParentContext = overrideParentContext ?? parentContext
  return {
    parentContext: resolvedParentContext,
    parentType: resolvedParentContext?.type ?? null,
  }
}

function createSparkConsume(
  parentContext: SparkCapabilityContext | null,
  fallbackContext?: SparkCapabilityContext,
): UseSparkCapabilityReaderReturn['sparkConsume'] {
  return ((name: string | symbol): unknown => {
    const lookupContext = fallbackContext ?? parentContext
    if (!lookupContext) return null
    const impl = rawSparkConsume(lookupContext, name)
    return impl !== undefined ? impl : null
  }) as UseSparkCapabilityReaderReturn['sparkConsume']
}

export function useSparkComponent(
  fallbackConfig: SparkNode | undefined,
  options: UseSparkComponentOptions & { mode: 'consume-only' }
): UseSparkCapabilityReaderReturn
export function useSparkComponent(
  fallbackConfig?: SparkNode,
  options?: UseSparkComponentOptions
): UseSparkComponentReturn

export function useSparkComponent(
  fallbackConfig?: SparkNode,
  options?: UseSparkComponentOptions
): UseSparkComponentReturn | UseSparkCapabilityReaderReturn {

  // ── 依赖注入 ──

  const { parentContext, parentType } = resolveParentAccess(options?.parentContext)

  if (options?.mode === 'consume-only') {
    return {
      parentContext,
      parentType,
      sparkConsume: createSparkConsume(parentContext),
    }
  }

  const registry = options?.registry ?? inject(SPARK_REGISTRY_KEY, undefined)
  const currentInstance = getCurrentInstance()

  // 组件配置来自 fallbackConfig 参数（调用方在 setup 中传入，如 { type: 'r-table' }）。
  // SparkComponentRenderer 通过 v-bind="componentProps" 传递 SparkNode.props（含 id），
  // ID 已在绑定阶段（bindSparkRuleEvents）按组件类型自动分配并去重。
  const config: SparkNode = buildEffectiveConfig(currentInstance, fallbackConfig)
  const resolvedType = config.type

  const resolvedId = nodeId(config) ?? `spark-${++_idCounter}`

  // ── 上下文创建 ──
  // 纯能力上下文不再进入 Vue 响应系统，仅保留能力链遍历所需字段。

  const context: SparkCapabilityContext = {
    id: resolvedId,
    type: resolvedType,
    capabilities: new Map<CapabilityName, unknown>(),
  }
  if (parentContext !== null) {
    context.parent = parentContext
  }

  // 向子组件提供当前 context
  vueProvide(INTERNAL_PARENT_CAPABILITY_CONTEXT_KEY, context)

  // ── 页面级实例登记（可选） ──
  const pageComponentRegistry = rawSparkConsume<PageComponentRegistry>(context, PAGE_COMPONENT_REGISTRY)
  if (pageComponentRegistry) {
    const componentProps = config.props ?? {}
    const instanceEntry = Object.keys(componentProps).length === 0
      ? { id: context.id, type: context.type }
      : { id: context.id, type: context.type, props: componentProps }
    pageComponentRegistry.registerInstance(instanceEntry)
  }

  // ── Logger（从能力链查找，带一次性缓存） ──
  //
  // 缓存策略：首次成功 sparkConsume 后缓存结果，避免每次日志调用都遍历 parent 链。
  // 失效时机：调用 sparkProvide(LOGGER, ...) 或 sparkProvide(APP_SERVICES, ...) 时主动置 null。
  // Late-binding 边界：父组件在 onMounted 中 sparkProvide(LOGGER) 时，
  // 若本组件的 sparkProvide() 未被触发则缓存不失效（已被这个父 sparkProvide 填充的子组件不受影响）。
  // 对于典型使用场景（setup 期间提供能力）此策略覆盖 100%；极端晚绑定下退化为重查一次。

  const fallbackLogger: LoggerApi = {
    debug: () => undefined,
    info: import.meta.env.DEV ? (...args: unknown[]) => console.info(...args) : () => undefined,
    warn: import.meta.env.DEV ? (...args: unknown[]) => console.warn(...args) : () => undefined,
    error: import.meta.env.DEV ? (...args: unknown[]) => console.error(...args) : () => undefined,
  }

  let _loggerCache: LoggerApi | null = null

  const resolveLogger = (): LoggerApi => {
    if (_loggerCache !== null) return _loggerCache
    // 1. 优先查找 LOGGER 能力键（最近祖先覆盖，实现组件子树级日志替换）
    const loggerImpl = rawSparkConsume<LoggerApi>(context, LOGGER)
    if (loggerImpl && typeof loggerImpl === 'object' && 'info' in loggerImpl) {
      _loggerCache = loggerImpl
      return loggerImpl
    }
    // 2. 次选 APP_SERVICES.logger（应用层统一提供）
    const appServices = rawSparkConsume<IAppServicesCapability>(context, APP_SERVICES)
    if (appServices?.logger) {
      _loggerCache = appServices.logger
      return appServices.logger
    }
    // fallback 不缓存：保留重查机会（等待父级 sparkProvide）
    return fallbackLogger
  }

  const logger: LoggerApi = {
    debug: (...args: unknown[]) => resolveLogger().debug(...args),
    info:  (...args: unknown[]) => resolveLogger().info(...args),
    warn:  (...args: unknown[]) => resolveLogger().warn(...args),
    error: (...args: unknown[]) => resolveLogger().error(...args)
  }

  // ── 计算属性 ──

  const isVisible = computed(() => nodeInputProp(buildEffectiveConfig(currentInstance, fallbackConfig), 'visible') !== false)
  const isDisabled = computed(() => nodeInputProp(buildEffectiveConfig(currentInstance, fallbackConfig), 'disabled') === true)

  // ── 能力提供 ──

  function sparkProvide(name: string | symbol, implementation?: unknown): void {
    rawSparkProvide(context, name, implementation)
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
    rawSparkProvide(context, name, emitter)
    return emitter
  }

  // ── 事件订阅追踪（防止内存泄漏） ──

  const _eventSubscriptions: Array<{ emitter: IEventEmitter; event: string; handler: (...args: unknown[]) => void }> = []

  // ── 能力消费 ──

  function sparkConsume(name: string | symbol): unknown {
    const impl = createSparkConsume(parentContext, context)(name)
    if (impl !== null) return impl
    if (import.meta.env.DEV) {
      logger.debug(`[spark] capability not found (late-binding ok): ${String(name)}`)
    }
    return null
  }

  function consumeEvents(
    name: string | symbol,
    handlers: Record<string, (...args: unknown[]) => void>
  ): IEventEmitter | null {
    const emitter = rawSparkConsume<IEventEmitter>(context, name)
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
    if (def?.component === undefined || def.component === null) return undefined
    return typeof def.component === 'object' ? markRaw(def.component) : def.component
  }

  function isComponentRegistered(type: string): boolean {
    return registry?.has(type) ?? false
  }

  // ── 生命周期 ──

  let _initialized = false
  const instanceUid = currentInstance?.uid

  const initialize = () => {
    if (_initialized) return
    _initialized = true
    if (import.meta.env.DEV) {
      const uidSuffix = instanceUid === undefined ? '' : `#uid:${instanceUid}`
      logger.debug(`[spark] init: ${context.type} (${context.id})${uidSuffix}`)
    }
  }

  const destroy = () => {
    _initialized = false
    // 清理所有通过 consumeEvents 注册的事件监听（防止内存泄漏）
    for (const sub of _eventSubscriptions) {
      sub.emitter.off(sub.event, sub.handler)
    }
    _eventSubscriptions.length = 0

    pageComponentRegistry?.unregisterInstance(context.id)
    context.capabilities.clear()
  }

  onMounted(() => initialize())
  onUnmounted(() => destroy())

  // ── API 注册 ──

  function registerApi(api: unknown): void {
    if (!pageComponentRegistry) return
    pageComponentRegistry.registerApi({ id: context.id, type: context.type, api })
  }

  // ── 返回值 ──

  return {
    context,
    parentContext: parentContext ?? null,
    parentType,
    isVisible,
    isDisabled,
    sparkProvide,
    provideEvents,
    getProvider,
    sparkConsume,
    consumeEvents,
    initialize,
    destroy,
    logger,
    getComponent,
    isComponentRegistered,
    registerApi
  }
}
