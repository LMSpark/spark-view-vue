/**
 * SPARK 组件目录 JSON Schema 类型定义
 *
 * 整个 AI 生成管线的**单一数据源**（SSoT）：
 * - 构建时：从 Vue SFC AST 提取 + 补充数据合并 → 生成 component-catalog.json
 * - 运行时：读取 JSON → 生成提示词 / 校验 AI 输出 / 提供组件 API 查询
 *
 * 完全脱离前端框架（零 Vue 依赖），可云部署。
 *
 * @module component-catalog-schema
 */

/* --------------------------------------------------------------------------
 * 顶层 Schema
 * ----------------------------------------------------------------------- */

/** 组件目录 JSON 根结构 */
export interface ComponentCatalog {
  /** Schema 版本，遵循 semver */
  version: '2.0.0'
  /** 构建时间 ISO 8601 */
  buildTime: string
  /** 组件总数 */
  componentCount: number

  /** 分类注册表：按角色归组的组件 type 列表 */
  registry: ComponentRegistry

  /** 组件条目：key = 组件 type（kebab-case） */
  components: Record<string, ComponentEntry>

  /** 平台约束（校验器使用） */
  constraints: PlatformConstraints
}

/* --------------------------------------------------------------------------
 * 注册表
 * ----------------------------------------------------------------------- */

export interface ComponentRegistry {
  /** 容器组件 */
  containers: string[]
  /** 字段组件 */
  fields: string[]
  /** 分组组件 */
  groups: string[]
  /** 元概念（非真实组件，仅文档） */
  meta: string[]
}

/* --------------------------------------------------------------------------
 * 组件条目
 * ----------------------------------------------------------------------- */

export interface ComponentEntry {
  /** kebab-case 注册名 */
  type: string
  /** 组件分类 */
  category: 'container' | 'field' | 'group' | 'meta' | 'feature'
  /** 一句话描述 */
  description: string

  /** Props — 结构化 API（来自 AST 提取或手工补充） */
  props: PropEntry[]
  /** Emits — 事件定义 */
  emits: EmitEntry[]
  /** 能力链 */
  capabilities: CapabilityInfo

  /** 根级语义字段（rule.json 中的顶级配置） */
  rootFields?: RootFieldEntry[]

  /** 附加约束 & 说明（补充文本，Markdown） */
  notes?: string

  /** 来源标记 */
  source: 'ast' | 'override' | 'addendum' | 'ast+addendum' | 'ast+override'
}

export interface PropEntry {
  name: string
  type: string
  required: boolean
  default?: string
  description?: string
}

export interface EmitEntry {
  name: string
  payload: Array<{ name: string; type: string }>
}

export interface CapabilityInfo {
  consumes: string[]
  provides: string[]
}

/** 根级语义字段（从 CATALOG_OVERRIDES 文本中提取的结构化信息） */
export interface RootFieldEntry {
  name: string
  type: string
  description: string
  /** 子字段（如 filter.columns, toolbar.items） */
  children?: RootFieldEntry[]
}

/* --------------------------------------------------------------------------
 * 平台约束（校验器复用）
 * ----------------------------------------------------------------------- */

export interface PlatformConstraints {
  /** DataKey 正则（字符串形式，校验器重建 RegExp） */
  dataKeyPattern: string
  /** HTML 原生标签白名单 */
  htmlTypes: string[]
  /** 合法组件类型前缀 */
  validTypePrefixes: string[]
  /** 合法聚合类型 */
  validAggregateTypes: string[]
  /** 非字段容器类型（r-* 但不是字段） */
  nonFieldRTypes: string[]
  /** 容器 → 语境映射 */
  containerContextMap: Record<string, string>
  /** 容器子组件嵌套规则 */
  nestingRules: Record<string, NestingRule>
}

export interface NestingRule {
  /** 允许的子组件类型模式 */
  allowedChildren: string[]
  /** 禁止的子组件类型 */
  forbiddenChildren?: string[]
  /** 说明文本 */
  note?: string
}
