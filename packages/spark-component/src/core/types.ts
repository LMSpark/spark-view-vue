/**
 * SPARK 组件系统 - 核心类型定义
 *
 * 设计原则：
 * - 最小化类型，只定义必要的接口
 * - 能力系统通过 capabilities Map 实现（继承自 ICapabilityContext）
 */

import type { InjectionKey } from 'vue'
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
 *   dock     → 子节点停靠区域（容器按 dock 过滤 children，默认 ''）
 *   order    → 同 dock 内排序权重（升序，默认 0）
 *
 * 组件运行时只消费 `props` 中的业务输入；
 * 页面绑定阶段会将根级兼容输入统一归集到 `props`，组件层本身不直接读取根级业务字段。
 *
 * ❗ id / dock / order 是**结构键**（框架基础设施使用），不会被视为组件业务输入。
 *
 * @example
 * ```jsonc
 * // r-table children —— 扁平一维数组，dock 区分区域
 * {
 *   "type": "r-table",
 *   "dataKey": "Orders@rows",
 *   "children": [
 *     // 省略 dock → 默认主内容区
 *     { "type": "el-table-column", "props": { "field": "name", "label": "姓名" } },
 *     { "type": "el-table-column", "props": { "field": "age",  "label": "年龄" }, "order": 2 },
 *     // dock: 'toolbar' → 顶部工具栏
 *     { "type": "el-button", "dock": "toolbar", "props": { "builtinAction": "append-row" } },
 *     // dock: 'actions' → 行操作列
 *     { "type": "el-button", "dock": "actions", "props": { "builtinAction": "delete-row" } }
 *   ]
 * }
 * ```
 */
export type SparkNodeChildren = SparkNode[] | string[]

export interface SparkNode {
  /** 组件类型（对应 ComponentDefinition.type） */
  type: string
  /** 组件属性（所有组件可见的数据均通过 props 传递） */
  props?: Record<string, unknown>
  /** 子组件配置（递归）；第三方 / HTML 组件允许直接传字符串文本子节点数组 */
  children?: SparkNodeChildren
  /**
   * 节点唯一标识
   *
   * 用途：渲染 key / 调试定位 / 脚本中通过 `$query('#id')` 引用。
   * 绑定阶段**不收入 props**；SparkComponentRenderer 直接读取并传递给 Vue `:key`。
   */
  id?: string
  /**
   * 停靠区域 — 子节点在父容器中的渲染目标区域
   *
   * 容器组件按 dock 值过滤 children，分区渲染：
    * - `''`（省略时默认）— 主内容区（列 / 表单字段 / 详情字段）
   * - `'toolbar'` — 顶部工具栏
   * - `'actions'` — 行操作列
   * - `'filter'`  — 筛选区
   * - `'header'`  — 头部区域
   * - `'footer'`  — 底部区域
   * - 自定义字符串 — 容器自行扩展
   *
    * 兼容：历史 `'default'` 会在运行时归一化为默认区域。
    *
    * @default ''
   */
  dock?: string
  /**
   * 排序权重 — 同一 dock 区域内的渲染顺序
   *
   * 升序排列（值越小越靠前），相同 order 按原始数组顺序保持稳定。
   *
   * @default 0
   */
  order?: number
}

// ── SparkNode 结构键（运行时） ────────────────────────────────────────────

/**
 * SparkNode 结构键集合
 *
 * 这些键归 SPARK 框架所有（type/props/children = h() 三段式，id = 标识，dock/order = 布局元数据），
 * 结构键永远只保留在 SparkNode 自身，不属于组件输入。
 */
export const SPARK_NODE_STRUCT_KEYS: ReadonlySet<string> = new Set<string>(['type', 'props', 'children', 'id', 'dock', 'order'])

// ── SparkNode 停靠区域工具函数 ────────────────────────────────────────────

/** 默认停靠区域（主内容区） */
export const DEFAULT_DOCK = ''

function normalizeDockValue(dock: string | undefined): string {
  if (dock === undefined || dock.length === 0 || dock === 'default') return DEFAULT_DOCK
  return dock
}

/**
 * 归一化 SparkNode 的结构语义。
 *
 * 统一处理：
 * - 空 type → fallbackType
 * - dock 缺省 / 'default' → DEFAULT_DOCK
 * - order 缺省 → 0
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
    ...(node.id !== undefined ? { id: node.id } : {}),
    dock: normalizeDockValue(node.dock),
    order: nodeOrder(node),
  }
}

/**
 * 读取节点的 dock 值（缺省 / 'default' → ''）
 */
export function nodeDock(node: SparkNode): string {
  return normalizeSparkNode(node).dock ?? DEFAULT_DOCK
}

/**
 * 读取节点的 order 值（缺省 → 0）
 */
export function nodeOrder(node: SparkNode): number {
  return typeof node.order === 'number' && Number.isFinite(node.order) ? node.order : 0
}

/**
 * 按 dock 过滤 + order 排序子节点
 *
 * 容器组件渲染流程：`getDockedChildren(children, 'toolbar')` → 按 order 升序 → 循环渲染。
 * 排序算法稳定：相同 order 保持原始数组顺序。
 * 只检查当前容器的**直属一级 children**；不会递归扫描二级及以下节点。
 * 二级及以下节点保留在其一级父节点子树内部，随一级父节点进入对应 dock。
 * 若一级子节点本身又是容器，则它可以在自己的 children 上再次执行 dock 分流。
 *
 * @param children SparkNode 子节点数组或字符串文本子节点
 * @param dock 目标停靠区域（默认 ''）
 * @returns 过滤 + 排序后的子节点数组
 *
 * @example
 * ```ts
 * const toolbarItems = getDockedChildren(props.children, 'toolbar')
 * const columns = getDockedChildren(props.children)  // dock=''
 * const actions = getDockedChildren(props.children, 'actions')
 * ```
 */
export function getDockedChildren(children: SparkNodeChildren | undefined, dock: string = DEFAULT_DOCK): SparkNode[] {
  if (!Array.isArray(children) || children.length === 0) return []
  const targetDock = normalizeDockValue(dock)
  const filtered = children.filter(isSparkNode).filter(child => nodeDock(child) === targetDock)
  if (filtered.length <= 1) return filtered
  // 稳定排序：相同 order 保持原始顺序
  return filtered.sort((a, b) => nodeOrder(a) - nodeOrder(b))
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
 * 读取节点 id
 *
 * 结构标识只读取顶层 `node.id`
 */
export function nodeId(node: { id?: string; props?: Record<string, unknown> }): string | undefined {
  if (typeof node.id === 'string') return node.id
  return undefined
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
// 停靠区域描述符（Dock Descriptor）—— 容器显示配置
// ============================================================================

/**
 * DockDescriptor — 停靠区域基础描述符
 *
 * 容器组件通过 `docks` prop 为每个 dock 区域配置显示参数。
 * 子节点通过 `dock` 字段声明自己归属哪个区域（见 SparkNode.dock），
 * DockDescriptor 描述该区域**如何渲染**（位置、样式等）。
 *
 * @example
 * ```jsonc
 * // rule.json — 容器 docks 配置
 * {
 *   "type": "r-table",
 *   "dataKey": "Orders@rows",
 *   "props": {
 *     "docks": {
 *       "toolbar": { "position": "top", "class": "my-toolbar" },
 *       "actions": { "position": "right", "label": "操作", "width": 160 }
 *     }
 *   },
 *   "children": [
 *     { "type": "el-table-column", "props": { "field": "name" } },
 *     { "type": "builtin-action", "dock": "toolbar", "props": { "builtinAction": "append-row" } },
 *     { "type": "builtin-action", "dock": "actions", "props": { "builtinAction": "delete-row" } }
 *   ]
 * }
 * ```
 */
export interface DockDescriptor {
  /** 自定义 CSS 类名 */
  class?: string
  /** 区域宽度/基准宽度（自定义 dock 与侧向 dock 可复用） */
  width?: string | number
}

/**
 * 工具栏停靠区域描述符
 *
 * 所有容器组件（r-table / r-form / r-tree / r-tabs / r-collapse / r-steps …）
 * 都可使用 toolbar dock。
 */
export interface DockToolbar extends DockDescriptor {
  /** 工具栏位置 @default 'top' */
  position?: 'top' | 'bottom' | 'left' | 'right'
}

/**
 * 行/项操作列停靠区域描述符
 *
 * r-table 的行操作列 / r-list 的项操作区。
 */
export interface DockActions extends DockDescriptor {
  /** 操作列位置 @default 'right' */
  position?: 'left' | 'right'
  /** 列标题 @default '操作' */
  label?: string
  /** 列宽 @default 160 */
  width?: string | number
  /** 对齐方式 @default 'left' */
  align?: 'left' | 'center' | 'right'
  /** 固定列 */
  fixed?: boolean | 'left' | 'right'
}

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
  props?: Record<string, unknown>
}

/**
 * 筛选区域停靠区域描述符
 *
 * r-table 的顶部筛选区。
 */
export interface DockFilter extends DockDescriptor {
  /** 筛选列（字段名字符串或完整配置对象） */
  columns?: Array<string | DockFilterItem>
  /** 是否可折叠 @default false */
  collapsible?: boolean
  /** 默认折叠 @default false */
  defaultCollapsed?: boolean
  /** 自适应最小宽度 @default '220px' */
  autoFitMinWidth?: string
  /** 单项跨列数 @default 1 */
  itemSpan?: number
  /** 网格列数 @default 24 */
  gridColumns?: number
  /** 网格间距 @default 12 */
  gridGap?: number | string
  /** 网格行高 @default 'minmax(32px, auto)' */
  gridAutoRows?: string
}

/**
 * 容器停靠区域配置映射
 *
 * 容器组件接收 `docks` prop，为每个 dock 名称指定显示描述符。
 * 内置 dock 名称拥有具体类型约束，自定义 dock 使用 `DockDescriptor`。
 *
 * @example
 * ```jsonc
 * {
 *   "toolbar": { "position": "bottom", "class": "dense-toolbar" },
 *   "actions": { "position": "right", "label": "操作", "width": 200, "fixed": "right" },
 *   "filter":  { "collapsible": true, "defaultCollapsed": false }
 * }
 * ```
 */
export interface ContainerDocks {
  /** 工具栏区域 */
  toolbar?: DockToolbar
  /** 行/项操作区域 */
  actions?: DockActions
  /** 筛选区域 */
  filter?: DockFilter
  /** 头部区域 */
  header?: DockDescriptor
  /** 底部区域 */
  footer?: DockDescriptor
  /** 自定义 dock 区域 */
  [dockName: string]: DockDescriptor | undefined
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

// ============================================================================
// DI Keys
// ============================================================================

/** 组件注册表注入键 */
export const SPARK_REGISTRY_KEY: InjectionKey<ComponentRegistry> = Symbol('sparkRegistry') as InjectionKey<ComponentRegistry>

// 日志类型 — 直接从 @spark-view/spark-utils 导入
export type { LoggerApi } from '@spark-view/spark-utils'
