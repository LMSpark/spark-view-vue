/**
 * 渲染器类型定义
 *
 * - BindRule: 框架无关的运行时规则类型（绑定管线使用）
 * - PageContext: 脚本沙箱上下文
 * - PageRendererProps: 页面渲染器配置
 * - RuleBindingOptions: 规则绑定配置
 */

import type { h as VueH } from 'vue'
import type { IDataSet, SparkData } from '@spark-view/spark-data'
import type { ConfigLoader, PageConfig, IPageRoute } from '@spark-view/spark-page-config'
import type { IPageServiceCapability, IModuleContext } from '@spark-view/spark-utils'
import type { ComponentRegistry } from '../types.js'
import type { PageComponentInstanceEntry } from '../capability-keys.js'

// PageConfig 来自 spark-page-config（数据配置层的权威定义），此处仅做重导出
export type { PageConfig }

// ── SparkNode v2 结构化配置类型 ───────────────────────────────────────────

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
  /** 组件原生属性（直接透传到目标组件的 props） */
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

/** DataConfig — 数据绑定 */
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

/** LayoutConfig — 布局控制 */
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
  /** 样式快捷方式 */
  style?: Record<string, string | number>
  /** CSS 类名 */
  class?: string | string[]
}

/** FilterConfig — 筛选器 */
export interface SparkNodeFilterConfig {
  columns?: string[]
  collapsible?: boolean
  defaultCollapsed?: boolean
  autoFitMinWidth?: string
  itemSpan?: number
  gridColumns?: number
  gridGap?: number | string
  gridAutoRows?: string
  class?: string
}

/** ToolbarConfig — 工具栏 */
export interface SparkNodeToolbarConfig {
  items: SparkNode[]
  position?: 'top' | 'bottom' | 'left' | 'right'
  class?: string
}

/** ActionsConfig — 操作区（简单模式 | 双区模式） */
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

/** StateConfig — 状态控制 */
export interface SparkNodeStateConfig {
  visible?: boolean
  disabled?: boolean
  modelValue?: unknown
  collapsed?: boolean
}

/** BehaviorConfig — 事件绑定 */
export interface SparkNodeBehaviorConfig {
  /** 事件绑定（key = 事件名，value = script.js 函数名） */
  on?: Record<string, string>
}

// ── 框架无关的运行时规则类型 ───────────────────────────────────────────────────

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
 * SPARK 渲染器的脚本沙箱使用此类型。
 */
export interface PageContext {
  $dataSet: IDataSet | null
  $components: PageComponentAccessApi
  $route: IPageRoute
  $moduleContext: IModuleContext | null
  $el: () => HTMLElement | null
  $query: (selector: string) => HTMLElement | null
  $queryAll: (selector: string) => NodeListOf<Element>
  $refreshData: (key?: string) => Promise<void>
  $page: IPageServiceCapability
  console: Pick<Console, 'log' | 'info' | 'warn' | 'error' | 'debug'>
  SparkData: typeof SparkData
  h: typeof VueH

  // Timer APIs
  setTimeout: (handler: (...args: unknown[]) => void, timeout?: number) => number
  clearTimeout: (id?: number) => void
  setInterval: (handler: (...args: unknown[]) => void, timeout?: number) => number
  clearInterval: (id?: number) => void
}

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
  pageFunctions: Record<string, (...args: unknown[]) => unknown>
  dataSet: IDataSet | null
  /** 组件注册表（可选）——用于查询 dataKey 行为元数据，替代硬编码的组件白名单 */
  registry?: ComponentRegistry
}


