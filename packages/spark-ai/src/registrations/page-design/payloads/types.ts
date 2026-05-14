/**
 * 组件目录 JSON Schema 类型定义（消费侧）
 *
 * spark-ai 不依赖 vite-plugin-spark-catalog（构建工具包），
 * 因此需要独立维护消费侧类型声明。
 * component-catalog.json 是单一 rich 目录（VCM + SFC 元注解 + 平台约束）。
 *
 * 消费时序（建议阅读顺序）：
 * 1. Raw*：读取构建产物最小原始结构。
 * 2. ComponentCatalog：进入运行时统一目录结构。
 * 3. ComponentEntry：按组件类型做目录查询与能力发现。
 * 4. Prop/Emit/Schema：按组件读取属性、事件和嵌套结构。
 * 5. Shared/Governance：做共享类型复用与治理约束。
 * 6. PlatformConstraints：做平台侧校验与嵌套规则限制。
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
// 二、Rich 根结构（运行时统一目录）
// =========================================================

/**
 * 组件目录 JSON 根结构（运行时消费主入口）。
 */
export interface ComponentCatalog {
  /** 目录版本。 */
  version: '4.0.0'
  /** 构建时间。 */
  buildTime: string
  /** 组件总数。 */
  componentCount: number
  /** 组件主索引：type -> 组件详情。 */
  components: Record<string, ComponentEntry>
  /**
   * Schema 自引用节点表。
   *
   * 每一行是一段 JSON Schema AST，`parentId` 指向同表父节点；
   * 组件 prop/emit 通过 `schemaNodeId` 指向根节点，后端可直接用递归 CTE 查询整棵结构。
   */
  schemaNodes?: SchemaNodeEntry[]
  /** 平台约束：dataKey、嵌套规则等。 */
  constraints?: PlatformConstraints
  /** 共享类型定义池。 */
  sharedTypes?: Record<string, SharedTypeDefinition>
  /** 绑定能力描述符池。 */
  bindingDescriptors?: Record<string, CatalogBindingDescriptor>
  /** 治理契约定义。 */
  governance?: CatalogGovernance
  /** 预留：API 表面摘要（由生成器控制结构）。 */
  apiSurface?: object
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
  /** JSON 示例值，面向 LLM/后端直接生成配置。 */
  examples?: unknown[]
  /** 指向 schemaNodes 的根节点 id。 */
  schemaNodeId?: string
  /**
   * 语义标签：该 prop 期望绑定的子组件 type（kebab-case）。
   * 来源于 JSDoc `@componentRef xxx`；与 schemaNodeId 互补（结构由 schemaNodeId 提供）。
   */
  componentRef?: string
}

/** JSON Schema 标准 type 名称。 */
export type JsonSchemaTypeName = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'

/**
 * 标准 JSON Schema 子集。
 *
 * 说明：
 * - 不使用自定义 kind 字段；
 * - 落盘时会被拆成 schemaNodes 自引用表；
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
  /** 引用其它 schema 定义；仅运行时重建 schema 时可能出现。 */
  $ref?: string
  /** 描述。 */
  description?: string
  /** 标准 JSON Schema default annotation。 */
  default?: unknown
  /** 标准 JSON Schema examples annotation。 */
  examples?: unknown[]
}

export interface PropSchemaProperty extends PropSchema {}

/** Schema 节点在自引用表中的关系类型。 */
export type SchemaNodeRelation = 'root' | 'property' | 'items' | 'prefixItem' | 'oneOf' | 'anyOf'

/** 后端可直接持久化的 schema 自引用表行。 */
export interface SchemaNodeEntry {
  /** 节点主键；根节点 id 等于 TypeScript 类型名。 */
  id: string
  /** 所属根节点 id，便于后端按 schema 分区查询。 */
  rootId: string
  /** 父节点 id；根节点为空。 */
  parentId?: string
  /** 与父节点的关系。 */
  relation: SchemaNodeRelation
  /** object property 名称，仅 relation=property 时使用。 */
  name?: string
  /** 数组/联合分支序号。 */
  index?: number
  /** property 是否必填。 */
  required?: boolean
  /** 指向另一棵 schema 根节点，仍然是 schemaNodes 同表 id。 */
  refId?: string
  /** 标准 JSON Schema type。 */
  type?: JsonSchemaTypeName | JsonSchemaTypeName[]
  /** 标准 JSON Schema title。 */
  title?: string
  /** 标准 JSON Schema description。 */
  description?: string
  /** 标准 JSON Schema enum。 */
  enum?: unknown[]
  /** 标准 JSON Schema const。 */
  const?: unknown
  /** 标准 JSON Schema default annotation。 */
  default?: unknown
  /** 标准 JSON Schema examples annotation。 */
  examples?: unknown[]
}

/** 单个 emit 事件定义。 */
export interface EmitEntry {
  /** 事件名。 */
  name: string
  /** 事件类型签名（可选）。 */
  type?: string
  /** 事件说明。 */
  description?: string
  /** 指向 schemaNodes 的根节点 id。 */
  schemaNodeId?: string
}

// =========================================================
// 五、绑定语义 / 治理契约 / 共享类型
// =========================================================

/** 组件绑定语义描述符。 */
export interface CatalogBindingDescriptor {
  /** LLM 可读绑定说明，解释该组件如何参与 dataKey/field/options/value 管线。 */
  description?: string
  /** 可直接参考的绑定配置示例。 */
  examples?: unknown[]
  /** 是否自解析 dataKey/上下文。 */
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

/** 治理配置根对象。 */
export interface CatalogGovernance {
  /** 契约表：contractName -> contract 定义。 */
  contracts: Record<string, GovernanceContract>
}

/** 单条治理契约定义。 */
export interface GovernanceContract {
  /** 契约层级。 */
  layer: 'props' | 'events' | 'api'
  /** 契约说明。 */
  description: string
  /** 契约成员名列表。 */
  members: string[]
}

/** 共享类型定义。 */
export interface SharedTypeDefinition {
  /** 类型名。 */
  name: string
  /** 类型说明。 */
  description: string
  /** 属性列表。 */
  properties: SharedTypeProperty[]
  /** 备注。 */
  notes?: string
}

/** 共享类型的单属性定义。 */
export interface SharedTypeProperty {
  /** 属性名。 */
  name: string
  /** 类型字符串。 */
  type: string
  /** 是否必填。 */
  required?: boolean
  /** 属性说明。 */
  description: string
}

// =========================================================
// 六、平台约束与嵌套规则
// =========================================================

/**
 * 平台级约束集合。
 *
 * 用途：
 * - 为目录消费侧提供统一的运行时校验边界；
 * - 在编辑器/LLM 场景下约束可生成的类型与嵌套关系。
 */
export interface PlatformConstraints {
  /** dataKey 正则约束。 */
  dataKeyPattern: CatalogConstraintEntry<string>
  /** 合法 type 前缀。 */
  validTypePrefixes: CatalogConstraintEntry<string[]>
  /** 合法聚合类型集合。 */
  validAggregateTypes: CatalogConstraintEntry<string[]>
  /** 非字段组件 r-type 集合。 */
  nonFieldRTypes: CatalogConstraintEntry<string[]>
  /** 容器上下文映射。 */
  containerContextMap: CatalogConstraintEntry<Record<string, string>>
  /** 嵌套规则表。 */
  nestingRules: CatalogConstraintEntry<Record<string, NestingRule>>
}

/** 带说明的平台约束条目。 */
export interface CatalogConstraintEntry<TValue> {
  /** 约束值，供校验器或后端直接消费。 */
  value: TValue
  /** LLM 可读说明：解释该约束限制什么、何时使用。 */
  description: string
  /** 可直接参考的合法示例。 */
  examples?: unknown[]
}

/** 单条嵌套规则定义。 */
export interface NestingRule {
  /** 允许的子组件 type。 */
  allowedChildren: string[]
  /** 禁止的子组件 type。 */
  forbiddenChildren?: string[]
  /** 规则备注。 */
  note?: string
}
