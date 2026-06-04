/**
 * SPARK 组件系统 - 核心类型定义
 *
 * 设计原则：
 * - 最小化类型，只定义必要的接口
 * - 能力系统通过 capabilities Map 实现（继承自 CapabilityContext）
 */

export type { SparkNode, SparkNodeChildren } from '@spark-appworks/spark-data'
export {
  SPARK_NODE_STRUCT_KEYS,
  normalizeSparkNode,
  isSparkNode,
  getSparkNodeChildren,
  nodeId,
  nodeInputProp,
  nodeInputProps,
} from '@spark-appworks/spark-data'

// 能力名称类型（从 spark-utils 重新导出）
export type {
  CapabilityName,
  CapabilityContext,
  CapabilityContext as SparkCapabilityContext,
} from '@spark-appworks/spark-utils'

// ============================================================================
// 组件定义（注册表使用）
// ============================================================================

/**
 * 组件定义 - Registry 中的条目
 */
export type ComponentDefinition = {
  /** 组件类型（kebab-case，如 'r-table'） */
  type: string
  /** Vue 组件实现 */
  component: unknown
  /** 扩展元数据 */
  meta?: Record<string, unknown>}

/**
 * 组件 children 传输策略（Registry meta.childrenMode）
 *
 * - `auto`：渲染器按组件声明自动判断；声明了 `children` prop 则走 prop，否则走默认 slot
 * - `prop`：强制将 SparkNode.children 作为 `children` prop 传给组件
 * - `slot`：强制将 SparkNode.children 作为默认 slot 递归渲染
 */
export type ComponentChildrenMode = 'auto' | 'prop' | 'slot'

// ============================================================================

/**
 */

// ============================================================================
// 筛选项配置（RendererFilter.vue 使用）
// ============================================================================

/**
 * 单个筛选项配置
 *
 * 简写：直接写字段名字符串，等价于 `{ field: 'xxx', component: 'text' }`。
 */
export type FilterItemConfig = {
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
  /** 选项字段映射（options 来自 DataView 成员时使用） */
  optionLabelField?: string
  optionValueField?: string
  /** 与其他条件的逻辑关系（覆盖全局 filter.logic，默认继承） */
  logic?: 'and' | 'or'
  /** 跨列数（覆盖全局 filter.itemSpan） */
  span?: number
  /** 透传到筛选组件的原生 props（如 placeholder、clearable 等） */
  componentProps?: Record<string, unknown>}

// ============================================================================
// 注册表接口
// ============================================================================

export type ComponentRegistry = {
  register(...args: ComponentRegistrationArgs): void
  get(type: string): ComponentDefinition | undefined
  has(type: string): boolean
  unregister(type: string): boolean
  getAll(): ReadonlyMap<string, ComponentDefinition>}

export type ComponentRegistrationInput = Readonly<{
  type: string
  component: unknown
  meta?: Record<string, unknown> | undefined
  options?: { silent?: boolean } | undefined
}>

export type ComponentRegistrationArgs =
  | readonly [input: ComponentRegistrationInput]
  | readonly [
    type: string,
    component: unknown,
    meta?: Record<string, unknown>,
    options?: { silent?: boolean },
  ]

// 日志类型 — 直接从 @spark-appworks/spark-utils 导入
export type { LoggerApi } from '@spark-appworks/spark-utils'

