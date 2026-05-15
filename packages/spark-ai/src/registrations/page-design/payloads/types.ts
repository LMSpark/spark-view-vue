/**
 * 组件目录 JSON Schema 类型定义（消费侧）
 *
 * spark-ai 不依赖 vite-plugin-spark-catalog（构建工具包），
 * 因此需要独立维护消费侧类型声明。
 * component-catalog.json 是单一 rich 目录（VCM + SFC 元注解 + 标准 JSON Schema）。
 *
 * 消费时序（建议阅读顺序）：
 * 1. Raw*：读取构建产物最小原始结构。
 * 2. ComponentCatalog：进入 v3 h-function catalog + 标准 JSON Schema `$defs`。
 * 3. ComponentEntry：按组件类型做目录查询与能力发现。
 * 4. Prop/Emit/Schema：按组件读取属性、事件和嵌套结构。
 */

// =========================================================
// 一、Raw 结构（构建产物最小快照）
// =========================================================

/**
 * 原始目录根结构（最小读取形态）。
 *
 * 典型场景：
 * - 调试构建产物是否包含基础元数据；
 * - 做从 Raw 到 Rich 目录的转换前校验。
 */
export interface RawComponentCatalog {
  /** 目录版本。 */
  version: '3.0.0'
  /** 构建时间（通常为 ISO 字符串）。 */
  buildTime: string
  /** 组件总数。 */
  componentCount: number
  /** type -> 原始组件定义。 */
  components: Record<string, RawComponentEntry>
}

/** 原始组件行（仅含文件路径 + props/emits 基本结构）。 */
export interface RawComponentEntry {
  /** 组件类型（kebab-case）。 */
  type: string
  /** 源文件路径。 */
  filePath: string
  /** 属性列表。 */
  props: PropEntry[]
  /** 事件列表。 */
  emits: EmitEntry[]
}

// =========================================================
// 二、组件目录根结构
// =========================================================

/**
 * 组件目录 JSON 根结构。
 */
export interface ComponentCatalog {
  /** JSON Schema draft 标识；catalog 内 schema 引用遵循 2020-12。 */
  $schema?: 'https://json-schema.org/draft/2020-12/schema'
  /** 目录版本。 */
  version: '3.0.0'
  /** 构建时间。 */
  buildTime: string
  /** 组件总数。 */
  componentCount: number
  /** type -> 组件定义。 */
  components: Record<string, ComponentEntry>
  /** 标准 JSON Schema definitions；复杂类型用 `#/$defs/{type}` 引用。 */
  $defs?: Record<string, PropSchema>
}

// =========================================================
// 三、组件目录主结构（查询/展示第一入口）
// =========================================================

/** 分类注册表：按类别列出组件 type。 */
export interface ComponentRegistry {
  /** 容器类组件 type 列表。 */
  containers: string[]
  /** 字段类组件 type 列表。 */
  fields: string[]
  /** 分组类组件 type 列表。 */
  groups: string[]
  /** 元组件 type 列表。 */
  meta: string[]
}

/**
 * 单组件目录行（最常用查询单元）。
 */
export interface ComponentEntry {
  /** 组件类型（唯一键）。 */
  type: string
  /** 源文件路径（可选，某些合成条目可能缺失）。 */
  filePath?: string
  /** 组件分类。 */
  category?: 'container' | 'field' | 'group' | 'meta' | 'feature'
  /** 组件摘要说明。 */
  description?: string
  /** 是否内部组件；内部组件不应被 LLM 当作可配置 SparkNode 使用。 */
  internal?: boolean
  /** 是否可作为页面配置组件使用；false 表示仅保留技术目录信息。 */
  configurable?: boolean
  /** 属性定义列表。 */
  props: PropEntry[]
  /** 事件定义列表。 */
  emits?: EmitEntry[]
  /** 契约引用（props/events/api）。 */
  contracts?: ComponentContractRefs
  /** 根字段路径树（常用于配置指引）。 */
  rootFields?: RootFieldEntry[]
  /** 组件备注。 */
  notes?: string
  /** capability provide 列表。 */
  provides?: string[]
  /** capability consume 列表。 */
  consumes?: string[]
  /** 来源标记。 */
  source?: 'vcm' | 'meta' | 'vcm+meta'
  /** 绑定语义描述。 */
  binding?: CatalogBindingDescriptor
}

/** 契约引用集合：只存 key，不存具体展开内容。 */
export interface ComponentContractRefs {
  /** props 契约引用键集合。 */
  props?: string[]
  /** events 契约引用键集合。 */
  events?: string[]
  /** api 契约引用键集合。 */
  api?: string[]
}

/** 根字段条目（用于配置路径与结构导览）。 */
export interface RootFieldEntry {
  /** 字段名。 */
  name: string
  /** 字段类型。 */
  type: string
  /** 字段说明。 */
  description: string
  /** 子字段（递归）。 */
  children?: RootFieldEntry[]
}

// =========================================================
// 四、属性/事件与 schema 结构
// =========================================================

/** 单个 prop 定义。 */
export interface PropEntry {
  /** prop 名。 */
  name: string
  /** 类型字符串。 */
  type: string
  /** 是否必填。 */
  required: boolean
  /** 默认值文本表达（可选）。 */
  default?: string
  /** 说明文案。 */
  description?: string
  /** 构建期 schema type 引用；运行时会转换为 JSON Schema `$ref`。 */
  schemaNodeId?: string
  /** 标准 JSON Schema；复杂类型通过 `$ref` 指向 `$defs`。 */
  schema?: PropSchema
}

/** JSON Schema 标准 type 名称。 */
export type JsonSchemaTypeName = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'

/**
 * 标准 JSON Schema 子集。
 *
 * 说明：
 * - 不使用自定义 kind 字段；
 * - 复杂对象以真实 type 为键进入 `$defs`；
 * - TypeScript 类型名使用标准 `title` 表达，不占用 JSON Schema `type`。
 */
export interface PropSchema {
  /** 标准 JSON Schema type。 */
  type?: JsonSchemaTypeName | JsonSchemaTypeName[]
  /** 对象属性。 */
  properties?: Record<string, PropSchemaProperty>
  /** object required 属性名列表。 */
  required?: string[]
  /** 枚举字面量。 */
  enum?: unknown[]
  /** 枚举/联合的逐分支说明。 */
  oneOf?: PropSchema[]
  /** const 字面量约束，常用于 oneOf 分支。 */
  const?: unknown
  /** 分支标题，常用于 oneOf 分支。 */
  title?: string
  /** 数组元素 schema。 */
  items?: PropSchema
  /** tuple / event 参数 schema。 */
  prefixItems?: PropSchema[]
  /** 联合 schema。 */
  anyOf?: PropSchema[]
  /** 标准 JSON Schema `$ref`，落盘时使用 `#/$defs/{type}`。 */
  $ref?: string
  /** 描述。 */
  description?: string
  /** 标准 JSON Schema default annotation。 */
  default?: unknown
  /** 标准 JSON Schema examples annotation。 */
  examples?: unknown[]
}

export interface PropSchemaProperty extends PropSchema {}

/** 单个 emit 事件定义。 */
export interface EmitEntry {
  /** 事件名。 */
  name: string
  /** 事件类型签名（可选）。 */
  type?: string
  /** 事件说明。 */
  description?: string
  /** 构建期 schema type 引用；运行时会转换为 JSON Schema `$ref`。 */
  schemaNodeId?: string
  /** 事件 payload 的 JSON Schema；通常为 tuple array，并在 prefixItems 中引用真实 type。 */
  schema?: PropSchema
}

// =========================================================
// 五、绑定语义
// =========================================================

/** 组件绑定语义描述符。 */
export interface CatalogBindingDescriptor {
  /** LLM 可读绑定说明，解释该组件如何参与 viewKey/dataKey/field/options/value 管线。 */
  description?: string
  /** 可直接参考的绑定配置示例。 */
  examples?: unknown[]
  /** 是否自解析 viewKey/dataKey/上下文。 */
  selfResolving?: boolean
  /** 绑定委派方。 */
  bindingDelegate?: string
  /** 是否数据容器。 */
  dataContainer?: boolean
  /** 是否字段提供者。 */
  fieldProvider?: boolean
  /** 是否列样式组件。 */
  columnLike?: boolean
  /** 是否动作组件。 */
  actionComponent?: boolean
  /** 是否具备 options 语义。 */
  hasOptions?: boolean
  /** 值类型提示。 */
  valueType?: string
}
