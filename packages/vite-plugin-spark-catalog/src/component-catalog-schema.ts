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

  /**
   * 共享类型定义（SparkNode 等框架级类型，一次定义多处引用）
   *
   * 组件 props 中出现的 `SparkNode[]` 等类型不再逐个组件展开 schema，
   * 统一引用此处的单例定义。AI 生成时查阅此表即可理解完整结构。
   */
  sharedTypes: Record<string, SharedTypeDefinition>

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

  /** Props — 结构化 API（来自 VCM 类型解析或手工补充） */
  props: PropEntry[]
  /** Emits — 事件定义 */
  emits: EmitEntry[]

  /** Exposed — defineExpose 公开的方法/属性 */
  exposed?: ExposedEntry[]
  /** Slots — 命名插槽及其 scope 类型 */
  slots?: SlotEntry[]

  /** 根级语义字段（rule.json 中的顶级配置） */
  rootFields?: RootFieldEntry[]

  /** 附加约束 & 说明（补充文本，Markdown） */
  notes?: string

  /** 来源标记 */
  source: 'ast' | 'override' | 'addendum' | 'ast+addendum' | 'ast+override' | 'vcm' | 'vcm+override' | 'vcm+addendum'
}

export interface PropEntry {
  name: string
  type: string
  required: boolean
  default?: string
  description?: string
  /** 嵌套类型 schema（对象类型展开、枚举变体等） */
  schema?: PropSchema
}

export interface EmitEntry {
  name: string
  /** 事件类型签名 */
  type?: string
  /** 事件描述 */
  description?: string
  /** 事件参数 schema */
  schema?: PropSchema[]
  /** @deprecated 旧格式兼容 — 优先使用 type + schema */
  payload?: Array<{ name: string; type: string }>
}

/** defineExpose 公开的方法/属性 */
export interface ExposedEntry {
  name: string
  type: string
  description?: string
  schema?: PropSchema
}

/** 命名插槽 */
export interface SlotEntry {
  name: string
  type: string
  description?: string
  schema?: PropSchema
}

/** 对象 schema 中的属性条目 */
export interface PropSchemaProperty {
  name: string
  type: string
  required?: boolean
  description?: string
  /** 递归嵌套 schema */
  schema?: PropSchema
}

/** 嵌套类型 Schema（递归结构，对应 vue-component-meta 的 PropertyMetaSchema） */
export type PropSchema =
  | { kind: 'object'; type: string; properties: Record<string, PropSchemaProperty> }
  | { kind: 'enum'; type: string; variants: string[] }
  | { kind: 'array'; type: string; items: PropSchema[] }
  | { kind: 'event'; type: string; params: PropSchema[] }

/** 根级语义字段（从 CATALOG_OVERRIDES 文本中提取的结构化信息） */
export interface RootFieldEntry {
  name: string
  type: string
  description: string
  /** 子字段（如 filter.columns, toolbar.items） */
  children?: RootFieldEntry[]
}

/* --------------------------------------------------------------------------
 * 共享类型定义（SparkNode 等框架级类型）
 * ----------------------------------------------------------------------- */

/** 共享类型定义条目 */
export interface SharedTypeDefinition {
  /** 类型名称 */
  name: string
  /** 类型描述 */
  description: string
  /** 属性列表 */
  properties: SharedTypeProperty[]
  /** 附加说明（Markdown） */
  notes?: string
}

/** 共享类型的属性条目 */
export interface SharedTypeProperty {
  name: string
  type: string
  required?: boolean
  description: string
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
