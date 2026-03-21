/**
 * 渲染器类型定义
 *
 * 功能分区：
 * 1) SparkNode v2 结构化配置（AI/配置输入层）
 * 2) BindRule 运行时规则（绑定管线输出层）
 * 3) 脚本沙箱上下文与组件访问 API（执行层）
 * 4) 页面渲染器与规则绑定参数（编排层）
 */

import type { IDataSet, SparkData } from '@spark-view/spark-data'
import type { ConfigLoader, PageConfig, IPageRoute, IScriptContext } from '@spark-view/spark-page-config'
import type { IPageServiceCapability, IModuleContext } from '@spark-view/spark-utils'
import type { ComponentRegistry } from '../types.js'
import type { PageComponentInstanceEntry } from '../capability-keys.js'

// ── 基础重导出 ────────────────────────────────────────────────────────────

// PageConfig 来自 spark-page-config（数据配置层权威定义），本文件仅透出类型
export type { PageConfig }
// IPageRoute 重导出供渲染层实现层使用
export type { IPageRoute }

// ── 分区 A：SparkNode v2（结构化输入模型） ─────────────────────────────────

/**
 * SparkNode v2 — 7 语义域结构化配置
 *
 * 设计原则：
 * - props 只放组件原生属性（border, size, type, label 等）
 * - meta 放 SPARK 框架语义（数据/布局/筛选/工具栏/操作/状态/行为）
 * - meta 中无内容的域省略不写
 * - children 为递归 SparkNode 数组
 */
export interface SparkNode {
  /** 组件类型（kebab-case，如 r-table / el-button / div） */
  type: string
  /** 唯一标识（省略则运行时自动生成 spark-${++counter}） */
  id?: string
  /**
   * 组件原生属性（直接透传到目标组件的 props）
   *
   * ⚠️ style / class 是 HTML/Vue 原生属性，应写在此处：
   * ```json
   * { "props": { "style": { "padding": "20px" }, "class": "my-div" } }
   * ```
   * 不要写在节点顶层——SparkNode 根级只保留 SPARK 语义字段。
   * 旧 rule.json（style/class 写在顶层）由 bindRules 向下兼容转换。
   */
  props?: Record<string, unknown>
  /** SPARK 语义域配置（7 域） */
  meta?: SparkNodeMeta
  /** 子组件（递归） */
  children?: SparkNode[]
}

export interface SparkNodeMeta {
  /** 数据绑定（dataKey / name / options） */
  data?: SparkNodeDataConfig
  /** 布局定位（colSpan / grid 容器） */
  layout?: SparkNodeLayoutConfig
  /** 筛选器（仅数据容器，独立于 data） */
  filter?: SparkNodeFilterConfig
  /** 工具栏（全局操作区） */
  toolbar?: SparkNodeToolbarConfig
  /** 上下文操作（行/节点/项，或弹窗头尾操作区） */
  actions?: SparkNodeActionsConfig
  /** 状态控制（visible / disabled / modelValue） */
  state?: SparkNodeStateConfig
  /** 事件绑定（统一 on 映射） */
  behavior?: SparkNodeBehaviorConfig
}

// 子域 A1：数据绑定
export interface SparkNodeDataConfig {
  /** DataKey 绑定键（如 Users@rows / Users@currentRow） */
  dataKey?: string
  /** 字段绑定名（映射到 DataView 行字段） */
  name?: string
  /** 选项数据源（r-select / r-radio 等字段组件） */
  options?: Array<{ label: string; value: unknown; children?: unknown[] }>
  /** 选项字段映射 */
  optionLabelField?: string
  optionValueField?: string
  optionChildrenField?: string
}

// 子域 A2：布局控制（SPARK 特有 grid 语义，不含 style/class）
//
// ⚠️ style 和 class 是原生 HTML/Vue 属性，应写在 props 内，不在此域。
export interface SparkNodeLayoutConfig {
  /** 在父 Grid 中的跨列数（24 列制） */
  colSpan?: number
  /** 在父 Grid 中的跨行数 */
  rowSpan?: number
  /** Grid 容器属性（当前节点作为父容器时生效） */
  grid?: {
    columns?: number
    gap?: number | string
    autoRows?: string
  }
}

// 子域 A3：筛选器配置

/**
 * 单个筛选项完整配置
 *
 * 简写形式：直接写字段名字符串，等价于 `{ field: 'xxx', component: 'text' }`。
 */
export interface SparkNodeFilterItem {
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

export interface SparkNodeFilterConfig {
  /**
   * 筛选项列表
   *
   * - `string`：字段名简写，等价于 `{ field: 'xxx', component: 'text' }`
   * - `SparkNodeFilterItem`：完整配置，支持组件类型/选项/逻辑关系
   */
  items?: Array<string | SparkNodeFilterItem>
  /**
   * 多条件默认逻辑关系（默认 `and`）
   *
   * 可在 `SparkNodeFilterItem.logic` 中按字段覆盖。
   */
  logic?: 'and' | 'or'
  /** 是否可折叠 */
  collapsible?: boolean
  defaultCollapsed?: boolean
  autoFitMinWidth?: string
  itemSpan?: number
  gridColumns?: number
  gridGap?: number | string
  gridAutoRows?: string
  class?: string
  /**
   * 筛选事件（value = script.js 函数名）
   *
   * - `search`：用户触发搜索（点击搜索按钮 / 回车）
   * - `reset`：重置筛选条件
   * - `change`：任意筛选字段值变化
   */
  on?: {
    search?: string
    reset?: string
    change?: string
  }
}

// 子域 A4：工具栏配置
export interface SparkNodeToolbarConfig {
  items: SparkNode[]
  position?: 'top' | 'bottom' | 'left' | 'right'
  class?: string
}

// 子域 A5：操作区配置（简单模式 | 双区模式）
export type SparkNodeActionsConfig = SparkNodeSimpleActionsConfig | SparkNodeDualActionsConfig

export interface SparkNodeSimpleActionsConfig {
  items: SparkNode[]
  position?: 'left' | 'right'
  label?: string
  width?: number | string
  align?: 'left' | 'center' | 'right'
  fixed?: boolean | 'left' | 'right'
  class?: string
}

export interface SparkNodeDualActionsConfig {
  header?: SparkNodeSimpleActionsConfig
  footer?: SparkNodeSimpleActionsConfig
}

// 子域 A6：状态控制
export interface SparkNodeStateConfig {
  visible?: boolean
  disabled?: boolean
  modelValue?: unknown
  collapsed?: boolean
}

// 子域 A7：行为/事件绑定
export interface SparkNodeBehaviorConfig {
  /** 事件绑定（key = 事件名，value = script.js 函数名） */
  on?: Record<string, string>
}

// ── 分区 B：BindRule（绑定管线运行时模型） ───────────────────────────────────

/**
 * 框架无关的运行时规则类型（绑定管线使用）
 *
 * `RuleConfig`（JSON 配置输入）经过 `bindDataToRules` 处理后的运行时表示：
 * - `on`: 字符串函数名 → 可调用函数
 * - `props`: 注入 DataView / 响应式 getter 等运行时对象
 * - `children`: 子规则递归处理后的运行时数组
 *
 * SPARK 渲染器将 `BindRule` 向下转型为 `ComponentConfig`。
 */
export interface BindRule {
  type: string
  name?: string
  props?: Record<string, unknown>
  children?: Array<BindRule | string>
  on?: Record<string, unknown>
  /** 索引签名覆盖 dataKey / display / options / style / class / slots 等动态属性 */
  [key: string]: unknown
}

// ── 分区 C：脚本沙箱能力（页面运行时访问面） ─────────────────────────────────

/** 页面脚本组件访问 API（由渲染器根节点注入） */
export interface PageComponentAccessApi {
  /** 按组件 id 获取实例快照（推荐） */
  get(id: string): PageComponentInstanceEntry | null
  /** 按组件 id 获取组件 API（推荐） */
  getApi<T = unknown>(id: string): T | null
  /** 列出页面组件实例（可按 type 过滤） */
  list(type?: string): PageComponentInstanceEntry[]
  /** 列出组件 API（可按 type 过滤） */
  getApis<T = unknown>(type?: string): T[]

  /** @deprecated 使用 get(id) */
  getInstance(id: string): PageComponentInstanceEntry | null
  /** @deprecated 使用 list(type?) */
  listInstances(type?: string): PageComponentInstanceEntry[]
}

/**
 * 页面脚本运行时上下文。
 *
 * 继承 `IScriptContext`（spark-page-config，框架无关契约），
 * 在此基础上添加 spark-component 层具体注入字段：
 * - `$dataSet` — DataSet 实例（具体类型）
 * - `$components` — 覆盖为更完整的 `PageComponentAccessApi`
 * - `SparkData` — 数据工具命名空间
 * - `h` — 渲染函数（Render* 专用）
 * - Timer API — 沙箱白名单
 */
export interface PageContext extends IScriptContext {
  /** 页面 DataSet（比 IScriptContext 额外注入的具体类型） */
  $dataSet: IDataSet | null
  /** 组件访问 API（覆盖 IScriptContext 基类，提供更丰富方法） */
  $components: PageComponentAccessApi
  /** SPARK 数据空间工具命名空间（createTreeManager 等，Render* 函数用） */
  SparkData: typeof SparkData
  /** 渲染函数（框架无关签名，运行时由渲染层注入，Render* 函数专用） */
  h: (type: unknown, ...args: unknown[]) => unknown

  // Timer API（沙箱白名单）
  setTimeout: (handler: (...args: unknown[]) => void, timeout?: number) => number
  clearTimeout: (id?: number) => void
  setInterval: (handler: (...args: unknown[]) => void, timeout?: number) => number
  clearInterval: (id?: number) => void
}

// ── 分区 D：渲染器编排入参 ──────────────────────────────────────────────────

/**
 * 页面渲染器 Props
 */
export interface PageRendererProps {
  /** 配置加载器实例 */
  configLoader?: ConfigLoader
  /** 页面唯一标识符（优先级最高） */
  pageId?: string
  /** 页面配置对象（直接传入，跳过加载） */
  pageConfig?: PageConfig
  /** 是否启用 CSS 作用域隔离 @default true */
  enableCssScope?: boolean
  /** 是否启用 DataSet 自动初始化 @default true */
  enableDataSet?: boolean
  /** UI 消息服务接口（可注入替代 ElementPlus） */
  messageService?: {
    success: (msg: string) => void
    warning: (msg: string) => void
    error: (msg: string) => void
    info: (msg: string) => void
  }
  /** UI 确认对话框服务接口（可注入替代 ElementPlus） */
  confirmService?: {
    confirm: (msg: string, title?: string) => Promise<unknown>
    alert: (msg: string, title?: string) => Promise<unknown>
    prompt?: (msg: string, title?: string) => Promise<string | null>
  }
  /** APP 层注入的页面服务扩展（弹层/文件能力等） */
  pageService?: Partial<IPageServiceCapability>
  /** 模块级上下文（导航系统提供，注入沙箱 $moduleContext） */
  moduleContext?: IModuleContext | null
  /** 页面加载前钩子函数 */
  beforeLoad?: (pageId: string) => void | Promise<void>
  /** 页面加载后钩子函数 */
  afterLoad?: (config: PageConfig) => void | Promise<void>
  /** 错误处理函数 */
  onError?: (error: Error) => void
}

/**
 * Rule 绑定选项
 */
export interface RuleBindingOptions {
  rules: BindRule[]
  /** script.js 可调用函数表（key 为函数名） */
  pageFunctions: Record<string, (...args: unknown[]) => unknown>
  /** 页面级 DataSet（单一数据入口） */
  dataSet: IDataSet | null
  /** 组件注册表（可选）——用于查询 dataKey 行为元数据，替代硬编码的组件白名单 */
  registry?: ComponentRegistry
}


