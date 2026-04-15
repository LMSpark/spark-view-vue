/**
 * 文件概述：
 * - 统一封装 Spark 组件的上下文创建、能力提供/消费、事件订阅与生命周期清理。
 * - 将 Vue 当前实例的运行时输入归一化为 SparkNode，并接入 Spark 自己的上下文树。
 * - 能力上下文的创建、消费和本地 provider 读取统一收口于 capabilities.ts，本文件只负责 Vue 运行时桥接。
 * - 组件 logger 统一取页面层 APP_SERVICES.logger；不再支持通过局部 LOGGER 覆盖形成子树级日志分叉。
 * - 对外暴露 useSparkConsume（只消费）和 useSparkComponent（创建并管理上下文）两个入口。
 */
import { computed, onMounted, onUnmounted, getCurrentInstance } from 'vue'
import { sparkProvide as rawSparkProvide, normalizeKey, APP_SERVICES } from '@spark-view/spark-utils'
import type { CapabilityKey, CapabilityTypeMap, LoggerApi } from '@spark-view/spark-utils'
import type { SparkCapabilityContext, SparkNode } from './types.js'
import { nodeId, nodeInputProp, normalizeSparkNode } from './types.js'
import { bindCapabilityContextOwner, resolveParentCapabilityContext, unbindCapabilityContextOwner, type SparkRuntimeOwner } from '../internal/capability-context.js'
import {
  DATA_ROW,
  PAGE_COMPONENT_REGISTRY,
  createSparkCapabilityConsumer,
  createSparkCapabilityContext,
  findNearestHost,
} from './capabilities.js'
import type { PageComponentRegistry, SparkCapabilityConsumer, SparkComponentHost } from './capabilities.js'

// 基础类型：约束当前文件内部的运行时实例。
type RuntimeInstance = ReturnType<typeof getCurrentInstance>

// 对外返回类型：定义组件上下文 API 与轻量消费 API。
export interface UseSparkComponentReturn {
  host: {
    readonly type: string | null
    readonly context: SparkCapabilityContext | null
    self(): { id: string; type: string }
    parent(): { id: string; type: string } | null
    ancestors(): Array<{ id: string; type: string }>
    nearestHost(): SparkComponentHost | null
    setHost(host: SparkComponentHost): void
  }
  isVisible: { readonly value: boolean }
  isDisabled: { readonly value: boolean }
  resolvedProps: { readonly value: Record<string, unknown> }
  sparkProvide: {
    <K extends keyof CapabilityTypeMap>(name: K, implementation: CapabilityTypeMap[K]): void
    <T>(name: CapabilityKey<T>, implementation: T): void
    (name: string | symbol, implementation?: unknown): void
  }
  sparkConsume: SparkCapabilityConsumer
  initialize: () => void
  destroy: () => void
  logger: LoggerApi
}

export interface UseSparkPageComponentReturn extends UseSparkComponentReturn {
  registerApi: (api: unknown) => void
}

export interface UseSparkCapabilityReaderReturn {
  host: {
    readonly type: string | null
    readonly context: SparkCapabilityContext | null
    parent(): { id: string; type: string } | null
    ancestors(): Array<{ id: string; type: string }>
    nearestHost(): SparkComponentHost | null
  }
  sparkConsume: SparkCapabilityConsumer
}

export interface UseSparkComponentOptions {
  hostContext?: SparkCapabilityContext
}

export type SparkNodeInput = {
  type: string
  props?: Record<string, unknown> | undefined
  children?: SparkNode['children'] | undefined
  id?: string | undefined
}

// 运行时常量：本地组件 id 计数器与开发态日志兜底实现。
let _idCounter = 0

const DEV_FALLBACK_LOGGER: LoggerApi = {
  debug: () => undefined,
  info: import.meta.env.DEV ? (...args: unknown[]) => console.info(...args) : () => undefined,
  warn: import.meta.env.DEV ? (...args: unknown[]) => console.warn(...args) : () => undefined,
  error: import.meta.env.DEV ? (...args: unknown[]) => console.error(...args) : () => undefined,
}

// ===== 配置归一化 =====

// 配置读取：过滤 Vue vnode 的内部字段，只保留需要合入 SparkNode 的运行时属性。
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

function readRuntimeVNodeProps(instance: RuntimeInstance): Record<string, unknown> {
  const rawProps = instance?.vnode.props
  if (!rawProps || typeof rawProps !== 'object') return {}

  const runtimeProps: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rawProps)) {
    if (isVueInternalVNodeProp(key) || isVueListenerProp(key)) continue
    runtimeProps[key] = value
  }
  return runtimeProps
}

function buildEffectiveConfig(instance: RuntimeInstance, fallbackConfig?: SparkNodeInput): SparkNode {
  const runtimeProps = readRuntimeVNodeProps(instance)
  const base = fallbackConfig === undefined
    ? ({ type: 'unknown' } as SparkNode & Record<string, unknown>)
    : ({ ...fallbackConfig } as SparkNode & Record<string, unknown>)

  if (Object.keys(runtimeProps).length > 0) {
    base.props = base.props === undefined
      ? runtimeProps
      : { ...base.props, ...runtimeProps }
  }

  return normalizeSparkNode(base, 'unknown')
}

function readConfigProp(instance: RuntimeInstance, fallbackConfig: SparkNodeInput | undefined, propName: string): unknown {
  return nodeInputProp(buildEffectiveConfig(instance, fallbackConfig), propName)
}

// ===== 上下文与能力辅助 =====

// 上下文解析：能力消费只依赖 Spark 自己的上下文树，不依赖 Vue provide/inject 传父链。
function resolveParentAccess(
  currentOwner: SparkRuntimeOwner | null,
  overrideHostContext?: SparkCapabilityContext,
): Omit<UseSparkCapabilityReaderReturn, 'sparkConsume'> {
  const resolvedHostContext = resolveParentCapabilityContext(currentOwner, overrideHostContext)
  const ancestors = (): Array<{ id: string; type: string }> => {
    const result: Array<{ id: string; type: string }> = []
    let current = resolvedHostContext
    while (current !== null) {
      result.push({ id: current.id, type: current.type })
      current = current.parent ?? null
    }
    return result
  }

  const nearestHost = (): SparkComponentHost | null => {
    let current = resolvedHostContext
    while (current !== null) {
      if (current.host !== undefined && current.host !== null) {
        return current.host as SparkComponentHost
      }
      current = current.parent ?? null
    }
    return null
  }

  return {
    host: {
      type: resolvedHostContext?.type ?? null,
      context: resolvedHostContext,
      parent() {
        return resolvedHostContext === null
          ? null
          : { id: resolvedHostContext.id, type: resolvedHostContext.type }
      },
      ancestors,
      nearestHost,
    },
  }
}

function registerPageComponentInstance(
  registry: PageComponentRegistry | null | undefined,
  context: SparkCapabilityContext,
  props?: Record<string, unknown>,
): void {
  if (!registry) return

  const instanceEntry = props === undefined || Object.keys(props).length === 0
    ? { id: context.id, type: context.type }
    : { id: context.id, type: context.type, props }

  registry.registerInstance(instanceEntry)
}

// ===== 日志辅助 =====

function isLoggerApi(value: unknown): value is LoggerApi {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<LoggerApi>
  return typeof candidate.debug === 'function'
    && typeof candidate.info === 'function'
    && typeof candidate.warn === 'function'
    && typeof candidate.error === 'function'
}

// 日志解析：统一取页面层 APP_SERVICES.logger，缺失时回退到开发日志。
function createPageLoggerProxy(context: SparkCapabilityContext): LoggerApi {
  const consumeFromCurrent = createSparkCapabilityConsumer(context)
  const resolveLogger = (): LoggerApi => {
    const appServices = consumeFromCurrent(APP_SERVICES)
    return isLoggerApi(appServices?.logger) ? appServices.logger : DEV_FALLBACK_LOGGER
  }

  return {
    debug: (...args: unknown[]) => resolveLogger().debug(...args),
    info: (...args: unknown[]) => resolveLogger().info(...args),
    warn: (...args: unknown[]) => resolveLogger().warn(...args),
    error: (...args: unknown[]) => resolveLogger().error(...args),
  }
}

// ===== 占位符解析 =====

const PLACEHOLDER_RE = /\$\[([^\]]+)\]/g
const PURE_PLACEHOLDER_RE = /^\$\[([^\]]+)\]$/

function hasPlaceholderString(value: unknown): boolean {
  if (typeof value === 'string') return value.includes('$[')
  if (Array.isArray(value)) return value.some(hasPlaceholderString)
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(hasPlaceholderString)
  }
  return false
}

function resolveValuePlaceholders(value: unknown, row: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const pureMatch = PURE_PLACEHOLDER_RE.exec(value)
    const pureField = pureMatch?.[1]
    if (pureField !== undefined) return row[pureField]
    if (!value.includes('$[')) return value
    return value.replace(PLACEHOLDER_RE, (_, fieldName: string) => {
      const val = row[fieldName]
      return val === null || val === undefined ? '' : String(val)
    })
  }
  if (Array.isArray(value)) {
    if (!value.some(hasPlaceholderString)) return value
    return value.map(v => resolveValuePlaceholders(v, row))
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (!Object.values(obj).some(hasPlaceholderString)) return value
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      result[k] = resolveValuePlaceholders(v, row)
    }
    return result
  }
  return value
}

export function resolvePlaceholderProps(
  props: Record<string, unknown>,
  row: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!row || !hasPlaceholderString(props)) return props
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    result[key] = resolveValuePlaceholders(value, row)
  }
  return result
}

// ===== 对外入口 =====

/**
 * 轻量能力消费 — 仅沿 parent 链查找能力，不创建自身上下文。
 */
export function useSparkConsume(): UseSparkCapabilityReaderReturn {
  const currentOwner = getCurrentInstance() as SparkRuntimeOwner | null
  const { host } = resolveParentAccess(currentOwner)
  return {
    host,
    sparkConsume: createSparkCapabilityConsumer(host.context),
  }
}

export function useSparkComponent(
  fallbackConfig?: SparkNodeInput,
  options?: UseSparkComponentOptions
): UseSparkComponentReturn {
  // 基础上下文：读取当前实例、配置和父上下文，组装当前 Spark 上下文。
  const currentInstance = getCurrentInstance()
  const currentOwner = currentInstance as SparkRuntimeOwner | null
  const config: SparkNode = buildEffectiveConfig(currentInstance, fallbackConfig)
  const contextId = nodeId(config) ?? `spark-${++_idCounter}`
  const { host } = resolveParentAccess(currentOwner, options?.hostContext)
  const hostContext = host.context
  const context = createSparkCapabilityContext({ id: contextId, type: config.type }, hostContext)
  const currentHost: UseSparkComponentReturn['host'] = {
    type: hostContext?.type ?? null,
    context: hostContext,
    self() {
      return { id: context.id, type: context.type }
    },
    parent() {
      return hostContext === null ? null : { id: hostContext.id, type: hostContext.type }
    },
    ancestors() {
      const result: Array<{ id: string; type: string }> = []
      let current = hostContext
      while (current !== null) {
        result.push({ id: current.id, type: current.type })
        current = current.parent ?? null
      }
      return result
    },
    nearestHost() {
      return findNearestHost(context)
    },
    setHost(nextHost: SparkComponentHost) {
      context.host = nextHost
    },
  }
  const consumeCapability = createSparkCapabilityConsumer(hostContext, context)

  if (currentInstance !== null) {
    bindCapabilityContextOwner(currentInstance as object, context)
  }

  // 页面注册：让页面级注册表可以按 id/type 找到当前组件实例。
  const pageComponentRegistry = consumeCapability(PAGE_COMPONENT_REGISTRY)
  registerPageComponentInstance(pageComponentRegistry, context, config.props)

  // 可视状态：统一从归一化后的配置读取 visible 和 disabled。
  const logger = createPageLoggerProxy(context)
  const readNormalizedConfigProp = (propName: string): unknown => {
    return readConfigProp(currentInstance, fallbackConfig, propName)
  }
  const isVisible = computed(() => readNormalizedConfigProp('visible') !== false)
  const isDisabled = computed(() => readNormalizedConfigProp('disabled') === true)

  // 占位符解析：将 props 中的 $[fieldName] 替换为 DATA_ROW 对应字段值。
  const resolvedProps = computed(() => {
    const props = buildEffectiveConfig(currentInstance, fallbackConfig).props ?? {}
    const row = consumeCapability(DATA_ROW) as Record<string, unknown> | null
    return resolvePlaceholderProps(props, row)
  })

  // 能力提供：向当前上下文写入能力。
  function sparkProvide(name: string | symbol, implementation?: unknown): void {
    rawSparkProvide(context, name, implementation)
    const key = normalizeKey(name)
    if (import.meta.env.DEV && key !== DATA_ROW) {
      logger.debug(`[spark] provided: ${String(name)}`)
    }
  }

  function sparkConsume(name: string | symbol): unknown {
    const impl = consumeCapability(name)
    if (impl !== null) return impl
    if (import.meta.env.DEV) {
      logger.debug(`[spark] capability not found (late-binding ok): ${String(name)}`)
    }
    return null
  }

  // 生命周期：初始化时记录调试信息，销毁时统一回收事件、注册表和 owner 绑定。
  let initialized = false
  const instanceUid = currentInstance?.uid

  const initialize = () => {
    if (initialized) return
    initialized = true
    if (import.meta.env.DEV) {
      const uidSuffix = instanceUid === undefined ? '' : `#uid:${instanceUid}`
      logger.debug(`[spark] init: ${context.type} (${context.id})${uidSuffix}`)
    }
  }

  const destroy = () => {
    initialized = false
    pageComponentRegistry?.unregisterInstance(context.id)
    context.capabilities.clear()
    if (currentInstance !== null) {
      unbindCapabilityContextOwner(currentInstance as object)
    }
  }

  onMounted(initialize)
  onUnmounted(destroy)

  return {
    host: currentHost,
    isVisible,
    isDisabled,
    resolvedProps,
    sparkProvide,
    sparkConsume,
    initialize,
    destroy,
    logger,
  }
}

export function useSparkPageComponent(
  fallbackConfig?: SparkNodeInput,
  options?: UseSparkComponentOptions,
): UseSparkPageComponentReturn {
  const component = useSparkComponent(fallbackConfig, options)

  function registerApi(api: unknown): void {
    const pageComponentRegistry = component.sparkConsume(PAGE_COMPONENT_REGISTRY)
    if (!pageComponentRegistry) return
    const self = component.host.self()
    pageComponentRegistry.registerApi({ id: self.id, type: self.type, api })
  }

  return {
    ...component,
    registerApi,
  }
}
