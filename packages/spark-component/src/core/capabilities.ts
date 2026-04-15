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

import { defineCapability, normalizeKey, sparkConsume as rawSparkConsume } from '@spark-view/spark-utils'
import type { IDataRow, IDataSet, IDataSource } from '@spark-view/spark-data'
import type { CapabilityKey, CapabilityName, CapabilityTypeMap, ICapabilityContext, IModuleContext, NavPermissionMode } from '@spark-view/spark-utils'
import type { SparkCapabilityContext } from './types.js'
import type { SparkNode } from './types.js'

/** 能力消费函数签名：统一返回 null，避免 undefined 向上游扩散。 */
export type SparkCapabilityConsumer = {
  <K extends keyof CapabilityTypeMap>(name: K): CapabilityTypeMap[K] | null
  <T>(name: CapabilityKey<T>): T | null
  (name: string | symbol): unknown
}

/** 页面内组件实例快照 */
export interface PageComponentInstanceEntry {
  id: string
  type: string
  props?: Record<string, unknown>
}

/** 页面内组件 API 条目 */
export interface PageComponentApiEntry {
  id: string
  type: string
  api: unknown
}

/** 页面级组件注册中心（实例 + API） */
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
 * 由 SparkPageRenderer 在初始化 useCssScope 后 sparkProvide；
 * 插件、子渲染器或需要动态注入 CSS 的组件可 sparkConsume 后按需追加样式。
 * 注入的 CSS 会被 pageId scoping 自动处理（与静态 style.css 一致）。
 */
export interface PageCssScopeCapability {
  /** 注入/追加 CSS 到当前页面作用域 */
  inject(css: string): void
}

/**
 * 创建最小能力上下文。
 *
 * 这里只负责 Spark 能力系统最小壳体：id / type / parent / capabilities。
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

/** 统一消费能力：未命中时返回 null，而不是 undefined。 */
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

/** 创建能力消费器：优先从 fallbackContext 开始查找，否则从 hostContext 开始。 */
export function createSparkCapabilityConsumer(
  hostContext: SparkCapabilityContext | null,
  fallbackContext?: SparkCapabilityContext,
): SparkCapabilityConsumer {
  return ((name: string | symbol): unknown => {
    const lookupContext = fallbackContext ?? hostContext
    return consumeSparkCapability(lookupContext, name)
  }) as SparkCapabilityConsumer
}

/** 直接读取当前上下文本地 provider，不沿 parent 链查找。 */
export function getSparkCapabilityProvider(
  context: SparkCapabilityContext,
  name: string | symbol,
): unknown {
  return context.capabilities.get(normalizeKey(name))
}

// 将能力键合并到 CapabilityTypeMap，消费方按字符串名称即可得到精确类型，
// 无需 import 能力符号对象。
declare module '@spark-view/spark-utils' {
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
  }
}

/**
 * 页面级 DataSet 能力键
 *
 * 由 PageRenderer 在 initDataSet 后 sparkProvide，
 * 容器组件通过 sparkConsume 获取后解析 dataKey → DataView。
 */
export const PAGE_DATASET = defineCapability<IDataSet>('spark:capability:page-dataset')

/**
 * 组件级数据视图能力键（DataView / IDataSource）
 *
 * 由容器组件在解析完 DataView 后 sparkProvide，
 * 子组件通过 sparkConsume 获取行数据、选中状态等。
 */
export const DATA_SOURCE = defineCapability<IDataSource>('spark:capability:data-source')

/**
 * 当前作用域行数据能力键
 * 容器组件 sparkProvide 当前作用域行数据，字段组件 sparkConsume 后读写字段值
 */
export const DATA_ROW = defineCapability<IDataRow>('spark:capability:data-row')

/**
 * 页面级组件注册中心能力键
 *
 * 由渲染器根节点 sparkProvide；所有组件可向其登记实例与 API，
 * 供脚本层按 id/type 查询与批量访问。
 */
export const PAGE_COMPONENT_REGISTRY = defineCapability<PageComponentRegistry>('app:page-component-registry')

/**
 * 模块上下文能力键
 *
 * 由页面渲染器根节点 sparkProvide，下游组件可 sparkConsume 后读取当前上下文并订阅变化。
 */
export const MODULE_CONTEXT = defineCapability<ModuleContextCapability>('app:module-context')

/**
 * 页面 CSS 作用域能力键
 *
 * 四文件中 style.css 的能力链收口：
 *   style.css → parseCss → PageConfig.css → setScopedCss + sparkProvide(CSS_SCOPE)
 *
 * 消费方：插件、嵌套渲染器、动态主题注入等。
 */
export const CSS_SCOPE = defineCapability<PageCssScopeCapability>('spark:capability:css-scope')

// ── 统一宿主协议 ────────────────────────────────────────────────────────

/**
 * 组件宿主接口 — 容器向子树声明"我是谁、我能做什么"
 *
 * 容器组件在创建 context 后设置 `context.host`，
 * 子组件通过 `findNearestHost()` 沿 parent 链向上查找最近的宿主。
 *
 * @spark-design host 是 context 上的一等公民字段，不是能力键。
 *   数据域能力键（DATA_SOURCE / DATA_ROW）解决的是"组件层级 ≠ 数据层级"，
 *   而 host 解决的是"子组件需要知道宿主的身份与能力"——这是组件树固有语义，
 *   不应走能力键分散注册。
 */
export interface SparkComponentHost {
  /** 字段渲染模式 — 容器对子树声明自身的字段展示语义。
   *  约定值：'table' | 'form' | 'tree' | 'detail'；开放 string 支持自定义容器扩展。
   *  字段组件通过 `nearestHost().fieldMode` 读取，无需感知容器精确类型名。 */
  readonly fieldMode?: string | undefined
  /** 宿主变体标识（如 'toolbar' | 'row-action'），子组件可据此调整自身行为 */
  readonly variant?: string | undefined
  /** 判断指定动作节点在当前宿主上下文中是否应禁用 */
  isDisabled?(action: SparkNode): boolean
  /** 执行指定动作节点 */
  execute?(action: SparkNode): void
}

/**
 * 沿 parent 链向上查找最近的宿主声明。
 *
 * 从 ctx.parent 开始查找（跳过自身），返回第一个设置了 host 的祖先上下文中的 host。
 */
export function findNearestHost(ctx: ICapabilityContext): SparkComponentHost | null {
  let current: ICapabilityContext | undefined = ctx.parent
  while (current) {
    if (current.host !== undefined && current.host !== null) {
      return current.host as SparkComponentHost
    }
    current = current.parent
  }
  return null
}

// PAGE_PERMISSION_MODE 已迁入 permission/page-permission-mode.ts（权限模块唯一维护）
