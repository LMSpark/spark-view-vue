/**
 * SPARK 组件系统 - 核心类型定义
 *
 * 设计原则：
 * - 最小化类型，只定义必要的接口
 * - ComponentContext = 配置 + 运行时状态 的统一表示
 * - 能力系统通过 capabilities Map 实现（继承自 ICapabilityContext）
 */

import type { InjectionKey } from 'vue'
import type { LoggerApi, ICapabilityContext } from '@spark-view/spark-utils'

// 能力名称类型（从 spark-utils 重新导出）
export type { CapabilityName, ICapabilityContext } from '@spark-view/spark-utils'

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
 * - `'self-resolve'`：组件内部 consume(PAGE_DATASET) 自行解析 dataKey prop（r-table、r-form 等）
 * - `'injected'`：由 bindRules 外部注入数据（el-table 等原生组件）
 * - `'none'`：不参与 dataKey 系统
 */
export type ComponentDataKeyBehavior = 'self-resolve' | 'injected' | 'none'

// ============================================================================
// 组件上下文（核心）
// ============================================================================

/**
 * ComponentContext - 组件实例的运行时表示
 *
 * 继承 ICapabilityContext（id, type, parent, capabilities），
 * 扩展 Vue 组件专属字段（props, children, state, logger）。
 *
 * 双重职责：
 * 1. 配置描述（JSON → type + props + children）
 * 2. 运行时管理（id + parent/children + capabilities）
 */
export interface ComponentContext extends ICapabilityContext {
  /** 组件属性（JSON 配置传入） */
  props?: Record<string, unknown>
  /** 子组件上下文（递归结构） */
  children?: ComponentContext[]
  /** 父上下文（能力查找用，覆盖基类为更具体的类型） */
  parent?: ICapabilityContext

  /** 运行时状态 */
  state: Record<string, unknown>

  /** 日志器 */
  logger?: LoggerApi
}

// ============================================================================
// 组件配置（输入类型）
// ============================================================================

/**
 * SparkNode - 组件配置的最小输入类型
 *
 * 设计参照 Vue `h(type, props, children)` 三段式：
 *   type     → 渲染什么组件
 *   props    → 组件接收的全部属性（dataKey / field / label … 均在此）
 *   children → 嵌套子节点
 *
 * 额外的 id / on / visible / disabled 是框架控制字段，
 * 与 h() 的 props 类似但语义属于 SPARK 渲染器自身消费，不传给业务组件。
 *
 * rule.json 允许将 dataKey / field 等写在根级（便于阅读），
 * 绑定阶段（bindSparkRuleEvents / bindDataToRules）会统一收入 props，
 * 渲染层一律通过 Vue Props 消费——组件代码只需关心 props，零认知负担。
 */
export interface SparkNode {
  /** 组件类型（对应 ComponentDefinition.type） */
  type: string
  /** 实例 ID（可选，运行时自动生成） */
  id?: string
  /** 组件属性（所有组件可见的数据均通过 props 传递） */
  props?: Record<string, unknown>
  /** 子组件配置（递归） */
  children?: SparkNode[]
  /** 可见性控制 */
  visible?: boolean
  /** 禁用状态控制 */
  disabled?: boolean

  // ── 事件（根级字段，bindRules 包装后由 Renderer 转发） ──
  /** 事件绑定（key 为 camelCase 事件名，value 为 script.js 函数名或运行时函数） */
  on?: Record<string, unknown>
}

// ============================================================================
// SparkNode 容器级配置类型
// ============================================================================

/** 工具栏配置（兼容 useContainerToolbar） */
export interface SparkNodeToolbar {
  /** 工具栏项列表 */
  items: SparkNode[]
  /** 位置 @default 'top' */
  position?: 'top' | 'bottom' | 'left' | 'right'
  /** 自定义 CSS 类名 */
  class?: string
}

/** 行操作列配置（兼容 useContainerActions） */
export interface SparkNodeActions {
  /** 操作按钮列表 */
  items: SparkNode[]
  /** 位置 @default 'right' */
  position?: 'left' | 'right'
  /** 列标题 @default '操作' */
  label?: string
  /** 列宽 @default 160 */
  width?: string | number
  /** 对齐方式 @default 'left' */
  align?: 'left' | 'center' | 'right'
  /** 自定义 CSS 类名 */
  class?: string
  /** 固定列 */
  fixed?: boolean | 'left' | 'right'
}

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

/** 筛选器配置（兼容 useTableFilters） */
export interface SparkNodeFilter {
  /** 筛选列（字段名字符串或完整配置对象） */
  columns: Array<string | SparkNodeFilterItem>
  /** 自定义 CSS 类名 */
  class?: string
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

/** 父级上下文注入键（替代字符串 'sparkParentContext'） */
export const SPARK_PARENT_CONTEXT_KEY: InjectionKey<ComponentContext> = Symbol('sparkParentContext') as InjectionKey<ComponentContext>

/** SparkNode 配置注入键 — SparkComponentRenderer 向子组件注入当前节点配置 */
export const SPARK_NODE_CONFIG_KEY: InjectionKey<SparkNode> = Symbol('sparkNodeConfig') as InjectionKey<SparkNode>

// 日志类型 — 直接从 @spark-view/spark-utils 导入
export type { LoggerApi } from '@spark-view/spark-utils'
