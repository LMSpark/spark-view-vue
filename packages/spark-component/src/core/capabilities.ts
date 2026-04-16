/**
 * 能力键定义
 *
 * 能力系统属于 spark-component / spark-app 层；
 * spark-data 是纯数据层，不关心组件树或能力 DI。
 *
 * ── 数据能力链 ──
 *   PageRenderer
 *     sparkProvide(PAGE_DATASET, dataSet) ← DataSet 实例（页面级）
 *       ↓
 *   容器组件（r-table / r-tree）
 *     sparkConsume(PAGE_DATASET)          ← 取 DataSet，解析 dataKey → DataView
 *     sparkProvide(DATA_SOURCE, dataView) ← DataView 实例（组件级）
 *       ↓
 *   子组件（行 / 单元格）
 *     sparkConsume(DATA_SOURCE)           ← 取 DataView（IDataSource）
 *
 * ── Renderer 容器 → 字段上下文链 ──
 *   容器组件（r-table / r-form / r-detail）
 *     通过 useSparkComponent 建立祖先 context.type 链
 *     sparkProvide(DATA_ROW, formModel) ← 当前作用域行数据（可写镜像）
 *       ↓
 *   字段组件（r-text / r-number …）
 *     沿祖先 context.type 链向上查找最近的字段宿主容器语义
 *     （scope 等中间层保持真实 type，不改写自身；字段侧统一通过宿主解析规则跳过或映射这些中间层）
 *     sparkConsume(DATA_ROW) ?? {}
 */

import { defineCapability, normalizeKey, sparkConsume as rawSparkConsume } from './capability-system.js'
import type { IDataRow, IDataSet, IDataSource } from '@spark-view/spark-data'
import type {
  CapabilityKey,
  CapabilityName,
  CapabilityTypeMap,
  ICapabilityContext,
  IModuleContext,
} from './capability-system.js'
import type { NavPermissionMode } from '@spark-view/spark-utils'
import type { SparkCapabilityContext } from './types.js'
import type { SparkNode } from './types.js'

// ===== 基础类型与能力消费约定 =====

/** 能力消费函数签名：统一返回 null，避免 undefined 向上游扩散。 */
export type SparkCapabilityConsumer = {
  <K extends keyof CapabilityTypeMap>(name: K): CapabilityTypeMap[K] | null
  <T>(name: CapabilityKey<T>): T | null
  (name: string | symbol): unknown
}

/** 页面内组件实例快照：记录当前页面上出现过的组件元信息。 */
export interface PageComponentInstanceEntry {
  id: string
  type: string
  props?: Record<string, unknown>
}

/** 页面内组件 API 条目：供脚本或页面级逻辑按 id/type 反查组件公开 API。 */
export interface PageComponentApiEntry {
  id: string
  type: string
  api: unknown
}

/** 页面级组件注册中心：统一维护实例快照和 API 映射。 */
export interface PageComponentRegistry {
  registerInstance(entry: PageComponentInstanceEntry): void
  unregisterInstance(id: string): void
  listInstances(type?: string): PageComponentInstanceEntry[]
  getInstance(id: string): PageComponentInstanceEntry | null

  registerApi(entry: PageComponentApiEntry): void
  unregisterApi(id: string): void
  listApis(type?: string): PageComponentApiEntry[]
  getApi<T = unknown>(id: string): T | null
  getApisByType<T = unknown>(type: string): T[]
}

/** 模块上下文能力（页面级） */
export interface ModuleContextCapability {
  /** 获取当前模块上下文快照 */
  getCurrent(): IModuleContext | null
  /** 订阅模块上下文变化，返回取消订阅函数 */
  subscribe(handler: (next: IModuleContext | null, prev: IModuleContext | null) => void): () => void
}

/**
 * 页面 CSS 作用域注入能力
 *
 * 由 SparkPageRenderer 在初始化 useCssScope 后提供。
 * 消费方可在当前页面作用域内追加样式，而不需要直接操作 DOM 或全局 style 标签。
 * 注入内容会自动带上 pageId 作用域，语义与静态 style.css 保持一致。
 */
export interface PageCssScopeCapability {
  /** 注入/追加 CSS 到当前页面作用域 */
  inject(css: string): void
}

// ===== Spark 能力上下文读写 =====

/**
 * 创建最小能力上下文。
 *
 * 这里只构建 Spark 能力系统自己的最小壳体：id / type / parent / capabilities。
 * 不附带额外运行时语义，宿主、注册表等能力都在后续按需挂接。
 */
export function createSparkCapabilityContext(
  config: { id: string; type: string },
  hostContext?: SparkCapabilityContext | null,
): SparkCapabilityContext {
  const context: SparkCapabilityContext = {
    id: config.id,
    type: config.type,
    capabilities: new Map<CapabilityName, unknown>(),
  }

  if (hostContext !== undefined && hostContext !== null) {
    context.parent = hostContext
  }

  return context
}

/** 统一消费能力：所有未命中场景都收敛为 null，避免 undefined 向上游扩散。 */
export function consumeSparkCapability<T>(
  context: SparkCapabilityContext | null | undefined,
  name: string | symbol,
): T | null {
  if (!context) {
    return null
  }

  const implementation = rawSparkConsume<T>(context, name)
  return implementation ?? null
}

/** 创建能力消费器：封装固定起点上下文，供组件内部反复读取能力。 */
export function createSparkCapabilityConsumer(
  context: SparkCapabilityContext | null,
): SparkCapabilityConsumer {
  return ((name: string | symbol): unknown => {
    return consumeSparkCapability(context, name)
  }) as SparkCapabilityConsumer
}

/** 直接读取当前上下文本地 provider，不沿 parent 链查找，适合做本地 provider 诊断。 */
export function getSparkCapabilityProvider(
  context: SparkCapabilityContext,
  name: string | symbol,
): unknown {
  return context.capabilities.get(normalizeKey(name))
}

// ===== CapabilityTypeMap 类型扩展 =====

// 将 spark-component 层定义的能力键合并进公共 CapabilityTypeMap，
// 这样消费方既可以传能力常量，也可以直接传字符串名称并获得精确类型。
declare module './capability-system.js' {
  interface CapabilityTypeMap {
    /** 页面级 DataSet（PageRenderer sparkProvide） */
    'spark:capability:page-dataset': IDataSet
    /** 组件级 DataView / IDataSource（容器组件 sparkProvide） */
    'spark:capability:data-source': IDataSource
    /** 当前作用域行数据（语义直接对应 IDataRow） */
    'spark:capability:data-row': IDataRow
    /** 页面级组件注册中心（整页实例与组件 API） */
    'app:page-component-registry': PageComponentRegistry
    /** 模块上下文能力（页面级） */
    'app:module-context': ModuleContextCapability
    /** 页面 CSS 作用域注入能力（由 SparkPageRenderer sparkProvide，四文件 style.css 收口） */
    'spark:capability:css-scope': PageCssScopeCapability
    /** 页面级权限模式（none=不控制 / masked=可见+脱敏 / invisible=后端控制） */
    'spark:capability:permission-mode': NavPermissionMode
    /** 动作执行能力（独立于宿主身份的 DI 通道） */
    'spark:capability:action-host': SparkActionCapability
    /** 最近宿主声明的字段渲染语义（能力化，不走 host 字段） */
    'spark:capability:host-field-mode': string
    /** 最近宿主声明的变体语义（能力化，不走 host 字段） */
    'spark:capability:host-variant': OpenHostVariant
  }
}

// ===== 标准能力键声明 =====

/**
 * 页面级 DataSet 能力键
 *
 * 页面渲染器在 initDataSet 后提供，作为整页数据空间入口。
 * 容器组件从这里取到 DataSet，再继续解析 dataKey 得到 DataView。
 */
export const PAGE_DATASET = defineCapability<IDataSet>('spark:capability:page-dataset')

/**
 * 组件级数据视图能力键（DataView / IDataSource）
 *
 * 容器组件在解析出 DataView 后提供，下游组件统一通过它读取行集、当前项、选中态等数据语义。
 */
export const DATA_SOURCE = defineCapability<IDataSource>('spark:capability:data-source')

/**
 * 当前作用域行数据能力键
 * 容器组件提供当前作用域行数据，字段组件消费后直接读写字段值。
 * 这是字段与宿主容器之间最轻量的行级数据桥梁。
 */
export const DATA_ROW = defineCapability<IDataRow>('spark:capability:data-row')

/**
 * 页面级组件注册中心能力键
 *
 * 由页面渲染根节点提供。
 * 所有组件都可以向其登记实例与 API，供脚本层或页面级联动逻辑按 id/type 检索与批量访问。
 */
export const PAGE_COMPONENT_REGISTRY = defineCapability<PageComponentRegistry>('app:page-component-registry')

/**
 * 模块上下文能力键
 *
 * 由页面渲染器根节点提供，下游组件读取当前模块上下文并订阅变化。
 */
export const MODULE_CONTEXT = defineCapability<ModuleContextCapability>('app:module-context')

/**
 * 页面 CSS 作用域能力键
 *
 * 四文件 style.css 的作用域注入链在这里收口：
 * style.css → parseCss → PageConfig.css → setScopedCss + sparkProvide(CSS_SCOPE)
 *
 * 典型消费方包括插件、嵌套渲染器和动态主题注入逻辑。
 */
export const CSS_SCOPE = defineCapability<PageCssScopeCapability>('spark:capability:css-scope')

// ===== 宿主协议与逐层查找规则 =====

/**
 * 宿主变体标识联合类型
 *
 * 约束宿主声明侧和消费侧使用的 variant 值范围，消除硬编码字符串。
 * 开放 string 后缀以兼容自定义扩展，但标准值优先使用此联合类型。
 */
export type HostVariant = 'toolbar' | 'row-action' | 'field'
export type OpenHostVariant = HostVariant | (string & {})

/**
 * 动作执行能力接口 — 与宿主身份解耦的独立能力
 *
 * 容器通过 sparkProvide(ACTION_CAPABILITY, impl) 提供动作执行能力，
 * 子组件通过 sparkConsume(ACTION_CAPABILITY) 消费。
 * 动作能力不属于宿主身份本身，必须通过独立能力键传递。
 */
export interface SparkActionCapability {
  isDisabled(action: SparkNode): boolean
  execute(action: SparkNode): void
}

/**
 * 动作执行能力键（主语义名）
 *
 * 独立于 host 的动作能力 DI 通道。容器 sparkProvide，子组件 sparkConsume。
 */
export const ACTION_CAPABILITY = defineCapability<SparkActionCapability>('spark:capability:action-host')

/** 宿主字段渲染语义能力键（由宿主作用域提供）。 */
export const HOST_FIELD_MODE = defineCapability<string>('spark:capability:host-field-mode')

/** 宿主变体语义能力键（由宿主作用域提供）。 */
export const HOST_VARIANT = defineCapability<OpenHostVariant>('spark:capability:host-variant')

/**
 * 组件宿主接口 — 容器向子树声明"我是谁、我能做什么"
 *
 * 宿主 = 纯组件层级关系描述，描述当前节点在组件树中的角色和边界。
 * 能力键 = 跨层消费的 DI 机制，用来快速跨组件层级消费祖先级提供的能力。
 * 两者职责不同，不应混用。
 *
 * 访问规则保持严格逐层：
 * 容器在自己的 context 上声明 host，子组件只能通过 nearestHost() 找到最近一层宿主。
 * 若确实需要访问更远层级，必须链式调用，而不是跳层直达。
 *
 * Host 只表达层级关系（父级、爷爷级）。
 * fieldMode / variant 均通过能力键传递：HOST_FIELD_MODE / HOST_VARIANT。
 * 动作禁用 / 执行等行为能力通过 ACTION_CAPABILITY 传递。
 */
export interface SparkHostLink {
  /** 更高一层祖先宿主（即当前宿主的父级宿主）。 */
  readonly host?: SparkHostLink | undefined
}

type HostSemantics = {
  fieldMode?: string | undefined
  variant?: OpenHostVariant | undefined
}

type SparkHostDescriptor = SparkHostLink & HostSemantics

function createHostLink(host?: SparkHostLink): SparkHostLink {
  return Object.freeze({
    ...(host !== undefined ? { host } : {}),
  })
}

function createHostDescriptor(
  fieldMode?: string,
  variant?: OpenHostVariant,
  host?: SparkHostLink,
): SparkHostDescriptor {
  return Object.freeze({
    ...(fieldMode !== undefined ? { fieldMode } : {}),
    ...(variant !== undefined ? { variant } : {}),
    ...(host !== undefined ? { host } : {}),
  })
}

// ===== 宿主工厂函数 =====

/**
 * 创建字段模式宿主 — 仅声明 fieldMode 身份
 *
 * 适用于 r-form / r-detail / r-table / r-tree 以及
 * Dialog / Drawer / Section 等非数据容器。
 */
export function createFieldHost(fieldMode: string, variant?: HostVariant): SparkHostLink {
  return createHostDescriptor(fieldMode, variant)
}

/**
 * 创建动作能力对象。
 *
 * 供 RendererHostScope 通过 ACTION_CAPABILITY 注入到当前子树，
 * 与 SparkHostLink 的层级语义完全分离。
 */
export function createActionCapability(actions: SparkActionCapability): SparkActionCapability {
  return Object.freeze(actions)
}

/**
 * 创建工具栏宿主身份 — 仅声明 variant='toolbar'。
 */
export function createToolbarHost(): SparkHostLink {
  return createHostDescriptor(undefined, 'toolbar')
}

/**
 * 创建行操作宿主身份 — 仅声明 variant='row-action'。
 */
export function createRowActionHost(): SparkHostLink {
  return createHostDescriptor(undefined, 'row-action')
}

/**
 * 将任意输入净化为宿主描述：
 * - Host 链只保留 host 关系字段
 * - 语义字段 fieldMode/variant 仅作为能力输入源提取
 *
 * 目的：坐实 Host=组件父子关系；语义能力与关系链路解耦。
 */
function sanitizeHostDescriptor(candidate: unknown): SparkHostDescriptor | null {
  if (candidate === null || candidate === undefined || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null
  }

  const raw = candidate as Record<string, unknown>
  const fieldMode = typeof raw['fieldMode'] === 'string' ? raw['fieldMode'] : undefined
  const variant = typeof raw['variant'] === 'string' ? raw['variant'] : undefined
  const parentDescriptor = sanitizeHostDescriptor(raw['host'])
  return createHostDescriptor(fieldMode, variant, parentDescriptor ?? undefined)
}

function resolveHostSemantics(candidate: unknown): HostSemantics {
  const descriptor = sanitizeHostDescriptor(candidate)
  return {
    fieldMode: descriptor?.fieldMode,
    variant: descriptor?.variant,
  }
}

function sanitizeHostLink(candidate: unknown): SparkHostLink | null {
  const descriptor = sanitizeHostDescriptor(candidate)
  if (descriptor === null) return null
  return createHostLink(descriptor.host)
}

function setLocalCapability<T>(ctx: SparkCapabilityContext, key: string | symbol, value: T | undefined): void {
  const normalized = normalizeKey(key)
  if (value === undefined) {
    ctx.capabilities.delete(normalized)
    return
  }
  ctx.capabilities.set(normalized, value)
}

/**
 * 以统一语义写入 context.host：只允许身份字段，杜绝行为字段混入。
 */
export function setHostIdentity(ctx: SparkCapabilityContext, host: SparkHostLink | undefined): void {
  ctx.host = host === undefined ? undefined : (sanitizeHostLink(host) ?? undefined)

  const semantics = resolveHostSemantics(host)
  setLocalCapability(ctx, HOST_FIELD_MODE, semantics.fieldMode)
  setLocalCapability(ctx, HOST_VARIANT, semantics.variant)
}

function buildHostLinkChain(start: ICapabilityContext | null | undefined): SparkHostLink | null {
  const links: SparkHostLink[] = []
  let current: ICapabilityContext | null | undefined = start

  while (current) {
    const link = sanitizeHostLink(current.host)
    if (link !== null) links.push(link)
    current = current.parent
  }

  if (links.length === 0) return null

  let chain: SparkHostLink | null = null
  for (let i = links.length; i > 0; i -= 1) {
    chain = createHostLink(chain ?? undefined)
  }

  return chain
}

/**
 * 逐层往上查找最近的已声明宿主。
 *
 * 默认查找从当前 context.parent 开始，而不是从自己开始，
 * 因为组件只应消费祖先宿主，不应把自己误识别为自己的宿主。
 *
 * 传入 options.includeSelf=true 时，会从当前 context 自身开始查找。
 *
 * 子组件应在 computed 或运行时函数里动态调用 nearestHost()，不要在 setup 阶段缓存结果。
 * 否则宿主对象若带有行级代理或动态上下文，后续变化将无法反映出来。
 */
export function findNearestHost(
  ctx: ICapabilityContext | null | undefined,
  options?: { includeSelf?: boolean },
): SparkHostLink | null {
  if (ctx === null || ctx === undefined) return null
  return buildHostLinkChain(options?.includeSelf === true ? ctx : ctx.parent)
}

// PAGE_PERMISSION_MODE 已迁入 permission/page-permission-mode.ts（权限模块唯一维护）
