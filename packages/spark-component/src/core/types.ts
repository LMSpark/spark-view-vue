/**
 * SPARK 组件系统 - 核心类型定义
 *
 * 设计原则：
 * - 最小化类型，只定义必要的接口
 * - 能力系统通过 capabilities Map 实现（继承自 ICapabilityContext）
 */

import type { ICapabilityContext } from '@spark-view/spark-utils'

// 能力名称类型（从 spark-utils 重新导出）
export type { CapabilityName } from '@spark-view/spark-utils'

// ============================================================================
// 组件定义（注册表使用）
// ============================================================================

/**
 * 组件定义 - Registry 中的条目
 */
export interface ComponentDefinition {
  /** 组件类型（kebab-case，如 'r-table'） */
  type: string
  /** Vue 组件实现 */
  component: unknown
  /** 扩展元数据 */
  meta?: Record<string, unknown>
}

/**
 * 组件 dataKey 行为声明（Registry meta.dataKey）
 *
 * - `'self-resolve'`：组件内部 sparkConsume(PAGE_DATASET) 自行解析 dataKey prop（r-table、r-form 等）
 * - `'injected'`：由渲染器/宿主层注入数据（如原生 el-* 适配场景）
 * - `'none'`：不参与 dataKey 系统
 */
export type ComponentDataKeyBehavior = 'self-resolve' | 'injected' | 'none'

/**
 * 组件 children 传输策略（Registry meta.childrenMode）
 *
 * - `auto`：渲染器按组件声明自动判断；声明了 `children` prop 则走 prop，否则走默认 slot
 * - `prop`：强制将 SparkNode.children 作为 `children` prop 传给组件
 * - `slot`：强制将 SparkNode.children 作为默认 slot 递归渲染
 */
export type ComponentChildrenMode = 'auto' | 'prop' | 'slot'

// ============================================================================
// 能力上下文（核心）
// ============================================================================

/**
 * SparkCapabilityContext - 纯能力上下文
 *
 * 只保留能力系统运行所需的最小结构：id / type / parent / capabilities。
 * 不再承载 Vue 组件 props、children、state、logger 等运行时字段。
 */
export type SparkCapabilityContext = ICapabilityContext

// ============================================================================
// 组件配置（输入类型）
// ============================================================================

/**
 * SparkNode - 组件配置的最小输入类型
 *
 * 严格对齐 Vue `h(type, props, children)` 三段式，仅保留 3 个根级字段 + 结构标识 `id`。
 *
 * 停靠区域（toolbar / actions / filter / header / footer / editor / tail）
 * 推荐通过结构化 props 表达，例如 `props.toolbar = { type: 'r-toolbar', children: [...] }`。
 * 容器运行时也兼容等价的 wrapper 子节点输入，例如 `r-toolbar` / `r-actions` / `r-filter` / `r-header` / `r-footer`。
 *
 * @example
 * ```jsonc
 * {
 *   "type": "r-table",
 *   "dataKey": "Orders@rows",
 *   "children": [
 *     {
 *       "type": "r-toolbar",
 *       "props": { "position": "top" },
 *       "children": [
 *         { "type": "builtin-action", "props": { "builtinAction": "append-row" } }
 *       ]
 *     },
 *     {
 *       "type": "r-actions",
 *       "props": { "position": "right" },
 *       "children": [
 *         { "type": "builtin-action", "props": { "builtinAction": "delete-row" } }
 *       ]
 *     },
 *     { "type": "el-table-column", "props": { "field": "name", "label": "姓名" } }
 *   ]
 * }
 * ```
 */
export type SparkTextChild = string | number

export type SparkNodeChildren = Array<SparkNode | SparkTextChild>

export interface SparkNode {
  /** 组件类型（对应 ComponentDefinition.type） */
  type: string
  /** 组件属性（所有组件可见的数据均通过 props 传递，含 id） */
  props?: Record<string, unknown>
  /** 子组件配置（递归）；第三方 / HTML 组件允许直接传字符串/数字文本子节点数组 */
  children?: SparkNodeChildren
}

// ── SparkNode 结构键（运行时） ────────────────────────────────────────────

/**
 * SparkNode 结构键集合（严格 h(type, props, children) 三段式）
 *
 * 只有这 3 个键归 SPARK 框架所有；id 是业务属性，存放在 props.id。
 */
export const SPARK_NODE_STRUCT_KEYS: ReadonlySet<string> = new Set<string>(['type', 'props', 'children'])

// ── SparkNode 归一化 ────────────────────────────────────────────

/**
 * 归一化 SparkNode 的结构语义。
 *
 * 统一处理：
 * - 空 type → fallbackType
 * - children 缺省 → []
 */
export function normalizeSparkNode(node: SparkNode, fallbackType: string = node.type): SparkNode {
  const normalizedType = typeof node.type === 'string' && node.type.length > 0
    ? node.type
    : (fallbackType.length > 0 ? fallbackType : 'unknown')

  return {
    type: normalizedType,
    ...(node.props !== undefined ? { props: node.props } : {}),
    children: Array.isArray(node.children) ? node.children : [],
  }
}

/** 判断值是否为 SparkNode 配置对象 */
export function isSparkNode(value: unknown): value is SparkNode {
  return value !== null
    && typeof value === 'object'
    && 'type' in value
    && typeof (value as { type?: unknown }).type === 'string'
}

/** 从 children 输入中提取结构子节点，忽略文本子节点 */
export function getSparkNodeChildren(children: SparkNodeChildren | undefined): SparkNode[] {
  if (!Array.isArray(children) || children.length === 0) return []
  return children.filter(isSparkNode)
}

/**
 * 读取节点 id（严格从 props.id）
 */
export function nodeId(node: { props?: Record<string, unknown> }): string | undefined {
  const id = node.props?.['id']
  return typeof id === 'string' ? id : undefined
}

/**
 * 读取节点输入属性。
 */
export function nodeInputProp(node: SparkNode, key: string): unknown {
  return node.props?.[key]
}

/**
 * 收集节点可传递输入属性。
 */
export function nodeInputProps(node: SparkNode): Record<string, unknown> {
  return node.props ?? {}
}

// ============================================================================
// 筛选项配置（DockFilter.vue 使用）
// ============================================================================

/**
 * 单个筛选项配置
 *
 * 简写：直接写字段名字符串，等价于 `{ field: 'xxx', component: 'text' }`。
 */
export interface DockFilterItem {
  /** 字段名（映射到数据源字段） */
  field: string
  /** 显示标签（省略则用字段名） */
  label?: string
  /**
   * 输入组件类型（默认 `text`）
   *
   * 内置：`text` | `select` | `date` | `date-range` | `number` | `number-range` | `checkbox` | `radio`
   * 扩展：传任意组件 type 字符串
   */
  component?: 'text' | 'select' | 'date' | 'date-range' | 'number' | 'number-range' | 'checkbox' | 'radio' | (string & {})
  /** 可选项列表（`component = select / radio / checkbox` 时使用） */
  options?: Array<{ label: string; value: unknown }>
  /** 选项字段映射（options 来自 DataKey 时使用） */
  optionLabelField?: string
  optionValueField?: string
  /** 与其他条件的逻辑关系（覆盖全局 filter.logic，默认继承） */
  logic?: 'and' | 'or'
  /** 跨列数（覆盖全局 filter.itemSpan） */
  span?: number
  /** 透传到筛选组件的原生 props（如 placeholder、clearable 等） */
  componentProps?: Record<string, unknown>
}

// ============================================================================
// 注册表接口
// ============================================================================

export interface ComponentRegistry {
  register(type: string, component: unknown, meta?: Record<string, unknown>, options?: { silent?: boolean }): void
  registerOnce(type: string, component: unknown, meta?: Record<string, unknown>): boolean
  get(type: string): ComponentDefinition | undefined
  has(type: string): boolean
  unregister(type: string): boolean
  getAll(): ReadonlyMap<string, ComponentDefinition>
}

// 日志类型 — 直接从 @spark-view/spark-utils 导入
export type { LoggerApi } from '@spark-view/spark-utils'
