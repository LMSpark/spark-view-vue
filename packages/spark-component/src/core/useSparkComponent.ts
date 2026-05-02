/**
 * 文件概述：
 * - 统一封装 Spark 组件的上下文创建、能力提供/消费、事件订阅与生命周期清理。
 * - 将 Vue 当前实例的运行时输入归一化为 SparkNode，并接入 Spark 自己的上下文树。
 * - 能力上下文的创建、消费和本地 provider 读取统一收口于 capabilities.ts，本文件只负责 Vue 运行时桥接。
 * - 组件 logger 统一取页面层 APP_SERVICES.logger；不再支持通过局部 LOGGER 覆盖形成子树级日志分叉。
 * - 对外暴露 useSparkConsume（只消费）和 useSparkComponent（创建并管理上下文）两个入口。
 */
import { computed, onMounted, onUnmounted, getCurrentInstance } from 'vue'
import * as capabilityApi from '@spark-view/spark-utils'
import {
  createSparkCapabilityConsumer,
  createSparkCapabilityContext,
  type CapabilityKey,
  type ICapabilityContext,
  type LoggerApi,
  type SparkCapabilityConsumer,
} from '@spark-view/spark-utils'
import { APP_SERVICES } from './capability-system.js'
import type { SparkCapabilityContext, SparkNode } from './types.js'
import { nodeId, nodeInputProp, normalizeSparkNode } from './types.js'
import { bindCapabilityContextOwner, resolveParentCapabilityContext, unbindCapabilityContextOwner, type SparkRuntimeOwner } from '@spark-view/spark-utils'
import {
  DATA_ROW,
  PAGE_COMPONENT_REGISTRY,
  findNearestCapabilityProvider,
  findNearestCapabilityProviderByKeys,
} from './capabilities.js'
import type { PageComponentRegistry } from './capabilities.js'

// ===== 类型与返回值约定 =====

// 约束当前文件内部使用的 Vue 运行时实例类型，避免到处重复写 ReturnType。
type RuntimeInstance = ReturnType<typeof getCurrentInstance>

/**
 * 组件上下文完整返回 — 容器 / 字段 / 页面组件的标准上下文入口。
 *
 * `provider` — provider 查询接口：
 *   - `nearestCapabilityProvider(key)` — 按能力键查最近 provider context
 *   - `nearestCapabilityProviderByKeys(keys)` — 按能力键集合查最近 provider context
 *
 * 容器可通过上下文 type 语义驱动子级渲染模式，子级按需消费并自决。
 * 子级独立自决：收到能力后，自己决定何时消费、如何使用，保持渲染自主权。
 */
export interface UseSparkComponentReturn {
  provider: {
    nearestCapabilityProvider<T>(name: CapabilityKey<T>): ICapabilityContext | null
    nearestCapabilityProviderByKeys(keys: ReadonlyArray<CapabilityKey<unknown>>): ICapabilityContext | null
  }
  isVisible: { readonly value: boolean }
  isDisabled: { readonly value: boolean }
  resolvedProps: { readonly value: Record<string, unknown> }
  sparkProvide: {
    <T>(name: CapabilityKey<T>, implementation: T): void
  }
  sparkRemove: <T>(name: CapabilityKey<T>) => void
  sparkConsume: SparkCapabilityConsumer
  logger: LoggerApi
}

export interface UseSparkPageComponentReturn extends UseSparkComponentReturn {
  registerApi: (api: unknown) => void
}

/**
 * 轻量消费返回 — 仅消费能力、查询 provider，不创建自身上下文。
 * 由 `useSparkConsume()` 返回，供只需读取上下文的组件使用。
 */
export interface UseSparkCapabilityReaderReturn {
  provider: {
    nearestCapabilityProvider<T>(name: CapabilityKey<T>): ICapabilityContext | null
    nearestCapabilityProviderByKeys(keys: ReadonlyArray<CapabilityKey<unknown>>): ICapabilityContext | null
  }
  sparkConsume: SparkCapabilityConsumer
}

export interface UseSparkComponentOptions {
  parentContext?: SparkCapabilityContext
}

interface HostTypeResolverOptions<T extends string = string> {
  hostTypes?: readonly T[]
}

interface ResolvedHostType<T extends string = string> {
  hostType: T | null
  parentContext: SparkCapabilityContext | null
}

export type SparkNodeInput = {
  type: string
  props?: Record<string, unknown> | undefined
  children?: SparkNode['children'] | undefined
  id?: string | undefined
}

function normalizeHostType<T extends string>(
  type: string,
  options: HostTypeResolverOptions<T>,
): T | null {
  if (options.hostTypes === undefined) {
    return type as T
  }

  return options.hostTypes.includes(type as T) ? (type as T) : null
}

export function resolveHostTypeFromContext<T extends string = string>(
  parentContext: SparkCapabilityContext | null,
  options: HostTypeResolverOptions<T> = {},
): ResolvedHostType<T> {
  let currentContext = parentContext

  while (currentContext !== null) {
    const currentType = typeof currentContext.type === 'string' ? currentContext.type : null
    if (currentType === null) {
      currentContext = currentContext.parent ?? null
      continue
    }

    const normalizedType = normalizeHostType(currentType, options)
    if (normalizedType !== null) {
      return {
        hostType: normalizedType,
        parentContext: currentContext,
      }
    }

    currentContext = currentContext.parent ?? null
  }

  return {
    hostType: null,
    parentContext: null,
  }
}

export function useSparkContextScope(
  type: string,
  options?: UseSparkComponentOptions,
): UseSparkComponentReturn {
  return useSparkComponent({ type }, options)
}

// ===== 运行时局部状态 =====

// 仅用于匿名 Spark 节点的本地 id 兜底，保证上下文树里每个节点都有稳定标识。
let _idCounter = 0

// ===== Vue 运行时输入 -> SparkNode 归一化 =====

// Vue 事件监听属性不属于 SparkNode.props 的业务配置，归一化时需要剔除。
function isVueListenerProp(key: string): boolean {
  return /^on[A-Z]/.test(key) || key === 'on'
}

// Vue vnode 内部字段只服务框架运行时，不能混入 Spark 的配置语义。
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

  // 只保留真实传入组件、且应该进入 SparkNode.props 的运行时字段。
  const runtimeProps: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rawProps)) {
    if (isVueInternalVNodeProp(key) || isVueListenerProp(key)) continue
    runtimeProps[key] = value
  }
  return runtimeProps
}

function buildEffectiveConfig(instance: RuntimeInstance, fallbackConfig?: SparkNodeInput): SparkNode {
  // fallbackConfig 提供静态配置骨架，vnode.props 负责补齐运行时传参，最终统一走 normalizeSparkNode。
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

// ===== Spark 上下文桥接与能力辅助 =====

// 父上下文解析完全走 Spark 自己维护的 owner -> context 链，不依赖 Vue 的 provide/inject 父链。
// 这样组件即使经过中间包装层，也仍然能沿 Spark 运行时树正确消费能力。
function resolveParentContext(
  currentOwner: SparkRuntimeOwner | null,
  overrideParentContext?: SparkCapabilityContext,
): SparkCapabilityContext | null {
  return resolveParentCapabilityContext(currentOwner, overrideParentContext)
}

function registerPageComponentInstance(
  registry: PageComponentRegistry | null | undefined,
  context: SparkCapabilityContext,
  props?: Record<string, unknown>,
): void {
  if (!registry) return

  // 页面注册表以 id/type 为主键索引组件，props 仅在存在时附带，避免写入无意义空对象。
  const instanceEntry = props === undefined || Object.keys(props).length === 0
    ? { id: context.id, type: context.type }
    : { id: context.id, type: context.type, props }

  registry.registerInstance(instanceEntry)
}

// ===== 页面级日志桥接 =====

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

// logger 始终从页面层 APP_SERVICES 取，避免局部子树私自覆盖后形成日志分叉。
function createPageLoggerProxy(context: SparkCapabilityContext): LoggerApi {
  const consumeFromCurrent = createSparkCapabilityConsumer(context)
  const resolveLogger = (): LoggerApi => {
    const appServices = consumeFromCurrent(APP_SERVICES)
    if (!isLoggerApi(appServices?.logger)) {
      throw new Error('[spark] APP_SERVICES.logger is required but missing. Ensure page root provides APP_SERVICES before components log.')
    }
    return appServices.logger
  }

  return {
    debug: (...args: unknown[]) => resolveLogger().debug(...args),
    info: (...args: unknown[]) => resolveLogger().info(...args),
    warn: (...args: unknown[]) => resolveLogger().warn(...args),
    error: (...args: unknown[]) => resolveLogger().error(...args),
  }
}

// ===== DATA_ROW 占位符解析 =====

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
    // 纯占位符保持原始值类型；嵌入式占位符则退化为字符串拼接。
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
  // 无 DATA_ROW 或 props 中根本没有占位符时直接复用原对象，避免无意义复制。
  if (!row || !hasPlaceholderString(props)) return props
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    result[key] = resolveValuePlaceholders(value, row)
  }
  return result
}

// ===== 对外入口：只消费能力 =====

/**
 * 轻量能力消费 — 仅沿 parent 链查找能力，不创建自身上下文。
 */
export function useSparkConsume(): UseSparkCapabilityReaderReturn {
  const currentOwner = getCurrentInstance() as SparkRuntimeOwner | null
  const parentContext = resolveParentContext(currentOwner)
  return {
    provider: {
      nearestCapabilityProvider: name => findNearestCapabilityProvider(parentContext, name, { includeSelf: true }),
      nearestCapabilityProviderByKeys: keys => findNearestCapabilityProviderByKeys(parentContext, keys, { includeSelf: true }),
    },
    sparkConsume: createSparkCapabilityConsumer(parentContext),
  }
}

export function useSparkComponent(
  fallbackConfig?: SparkNodeInput,
  options?: UseSparkComponentOptions
): UseSparkComponentReturn {
  // 先将 Vue 当前实例和 fallbackConfig 归一化为 SparkNode，再挂接到父能力上下文之下。
  const currentInstance = getCurrentInstance()
  const currentOwner = currentInstance as SparkRuntimeOwner | null
  const config: SparkNode = buildEffectiveConfig(currentInstance, fallbackConfig)
  const contextId = nodeId(config) ?? `spark-${++_idCounter}`
  const parentContext = resolveParentContext(
    currentOwner,
    options?.parentContext,
  )
  const context = createSparkCapabilityContext({ id: contextId, type: config.type }, parentContext)
  const currentProvider: UseSparkComponentReturn['provider'] = {
    nearestCapabilityProvider(name) {
      return findNearestCapabilityProvider(context, name)
    },
    nearestCapabilityProviderByKeys(keys) {
      return findNearestCapabilityProviderByKeys(context, keys)
    },
  }
  const consumeCapability = createSparkCapabilityConsumer(context)

  if (currentInstance !== null) {
    // 绑定 owner 后，后代组件就能通过当前 Vue 实例回溯到这棵 SparkContext 子树。
    bindCapabilityContextOwner(currentInstance as object, context)
  }

  // 页面注册表保存组件实例元信息，供页面级 API、调试和联动能力做反查。
  const pageComponentRegistry = consumeCapability(PAGE_COMPONENT_REGISTRY)
  registerPageComponentInstance(pageComponentRegistry, context, config.props)

  // 统一从归一化配置读取可视/禁用状态，避免 props 来源分散导致语义不一致。
  const logger = createPageLoggerProxy(context)
  const effectiveConfig = computed(() => buildEffectiveConfig(currentInstance, fallbackConfig))
  const readNormalizedConfigProp = (propName: string): unknown => {
    return nodeInputProp(effectiveConfig.value, propName)
  }
  const isVisible = computed(() => readNormalizedConfigProp('visible') !== false)
  const isDisabled = computed(() => readNormalizedConfigProp('disabled') === true)

  // props 中若引用了 DATA_ROW 占位符，在这里统一投影为最终给组件消费的运行时 props。
  const resolvedProps = computed(() => {
    const props = effectiveConfig.value.props ?? {}
    const row = consumeCapability(DATA_ROW) as Record<string, unknown> | null
    return resolvePlaceholderProps(props, row)
  })

  // ===== 当前组件暴露给后代的能力读写 =====

  function sparkProvide<T>(name: CapabilityKey<T>, implementation: T): void {
    if (implementation === undefined) {
      throw new Error(`[spark] sparkProvide received undefined implementation: ${String(name)}. Use sparkRemove(name) to clear capability explicitly.`)
    }
    capabilityApi.sparkProvide(context, name, implementation)
  }

  function sparkRemove<T>(name: CapabilityKey<T>): void {
    capabilityApi.sparkRemove(context, name)
  }

  function sparkConsume<T>(name: CapabilityKey<T>): T | null {
    const impl = consumeCapability(name)
    return impl
  }

  // ===== 生命周期：初始化日志与上下文清理 =====

  let initialized = false
  const initialize = () => {
    if (initialized) return
    initialized = true
  }

  const destroy = () => {
    initialized = false
    // 只清理当前 context 和注册表引用，不销毁 DataSet 之类外部共享对象。
    pageComponentRegistry?.unregisterInstance(context.id)
    context.capabilities.clear()
    if (currentInstance !== null) {
      unbindCapabilityContextOwner(currentInstance as object)
    }
  }

  onMounted(initialize)
  onUnmounted(destroy)

  return {
    provider: currentProvider,
    isVisible,
    isDisabled,
    resolvedProps,
    sparkProvide,
    sparkRemove,
    sparkConsume,
    logger,
  }
}

// ===== 对外入口：页面级组件扩展 =====

export function useSparkPageComponent(
  fallbackConfig?: SparkNodeInput,
  options?: UseSparkComponentOptions,
): UseSparkPageComponentReturn {
  // 捕获当前 setup 期间的实例引用，供 registerApi 闭包在 setup 结束前同步使用。
  const currentInstance = getCurrentInstance()
  const component = useSparkComponent(fallbackConfig, options)

  function registerApi(api: unknown): void {
    const pageComponentRegistry = component.sparkConsume(PAGE_COMPONENT_REGISTRY)
    if (!pageComponentRegistry) return
    // 重新从 vnode props 解析 config。id 可能为 null（匿名组件），此时用空字符串作 key，
    // getApisByType 按 type 过滤，仍能正确查到。
    const config = buildEffectiveConfig(currentInstance, fallbackConfig)
    const id = nodeId(config) ?? ''
    pageComponentRegistry.registerApi({ id, type: config.type, api })
  }

  return {
    ...component,
    registerApi,
  }
}
