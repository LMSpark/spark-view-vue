/**
 * SPARK 组件目录 JSON Schema 类型定义
 *
 * 整个组件元数据管线的**单一数据源**（SSoT）：
 * - 构建时：vue-component-meta 类型提取 + SFC JSDoc 注解解析 → 生成 component-catalog.json
 * - 运行时：消费方按需投影 JSON 子集
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
  version: '4.0.0'
  /** 构建时间 ISO 8601 */
  buildTime: string
  /** 组件总数 */
  componentCount: number

  /** 组件条目：key = 组件 type（kebab-case），目录主入口。 */
  components: Record<string, ComponentEntry>

  /**
   * 共享类型定义（SparkNode 等框架级类型，一次定义多处引用）
   *
   * 组件 props 中出现的 `SparkNode[]` 等类型不再逐个组件展开 schema，
   * 统一引用此处的单例定义。AI 生成时查阅此表即可理解完整结构。
   */
  sharedTypes: Record<string, SharedTypeDefinition>

  /**
   * Schema 自引用节点表。
   *
   * 每一行是一段 JSON Schema AST，`parentId` 指向同表父节点；
   * 组件 prop/emit 通过 `schemaNodeId` 指向根节点，后端可直接用递归 CTE 查询整棵结构。
   */
  schemaNodes?: SchemaNodeEntry[]

  /** API 全息表面：DataView / DataSet / 沙箱注入变量的公共方法签名 */
  apiSurface?: ApiSurface

  /** 平台约束（校验器使用） */
  constraints: PlatformConstraints

  /**
   * 组件绑定行为描述符（全量映射）
   *
   * 包含所有在绑定管线中有角色的组件类型（el-* 静态 + r-* 推断），
   * 运行时 component-binding-registry 可从此初始化。
   * AI 可查阅此表理解组件的数据绑定行为。
   */
  bindingDescriptors: Record<string, CatalogBindingDescriptor>

  /**
   * 治理契约字典（Vue 约束 -> AI 可读契约）
   *
   * 将组件公共 Props / 事件 / API 的“约束层”显式建模，
   * 让 AI 在生成配置时优先基于契约推理，而不是逐组件重复学习。
   */
  governance?: CatalogGovernance
}

/**
 * Raw VCM 提取目录（完整 wrapper 结构）。
 *
 * 保留 version / buildTime / componentCount 元信息，
 * components 内为 vue-component-meta 的直接提取结果。
 */
export interface RawComponentCatalog {
  /** Schema 版本 */
  version: string
  /** 构建时间 ISO 8601 */
  buildTime: string
  /** 组件总数 */
  componentCount: number
  /** 组件条目：key = 组件 type（kebab-case） */
  components: Record<string, RawComponentEntry>
}

export interface RawComponentEntry {
  type: string
  filePath: string
  props: PropEntry[]
  emits: EmitEntry[]
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
  /** 源文件相对路径（用于诊断与差异分析） */
  filePath?: string
  /** 组件分类 */
  category: 'container' | 'field' | 'group' | 'meta' | 'feature'
  /** 一句话描述 */
  description: string
  /** 是否内部组件；内部组件不应被 LLM 当作可配置 SparkNode 使用。 */
  internal?: boolean
  /** 是否可作为页面配置组件使用；false 表示仅保留技术目录信息。 */
  configurable?: boolean

  /** Props — 结构化 API（来自 VCM 类型解析或手工补充） */
  props: PropEntry[]
  /** Emits — 事件定义 */
  emits: EmitEntry[]

  /** 根级语义字段（rule.json 中的顶级配置） */
  rootFields?: RootFieldEntry[]

  /** 附加约束 & 说明（补充文本，Markdown） */
  notes?: string

  /** 本组件提供的能力键（SFC @provides 注解） */
  provides?: string[]
  /** 本组件消费的能力键（SFC @consumes 注解） */
  consumes?: string[]

  /** 来源标记 */
  source: 'vcm' | 'meta' | 'vcm+meta'

  /** 绑定行为描述符（从 VCM props 推断或静态声明） */
  binding?: CatalogBindingDescriptor

  /** 组件命中的治理契约引用（按层分组） */
  contracts?: ComponentContractRefs

  /**
   * Props 接口命名规范信息。
   *
   * 当组件有匹配命名规范的公开 Props 接口时填充，
   * 供 AI 和外部工具以稳定的类型名引用组件属性。
   */
  propsInterface?: PropsInterfaceRef
}

/**
 * Props 接口命名规范引用。
 *
 * 命名规范：组件 type `r-xxx` → 接口名 `RXxxProps`，
 * 定义在 `{ComponentName}.props.ts` 中并通过 barrel 导出。
 */
export interface PropsInterfaceRef {
  /** 接口名（如 `RTableProps`） */
  name: string
  /** 定义文件相对路径 */
  file: string
  /** 是否通过包入口公开导出 */
  exported: boolean
}

/** 组件命中的治理契约引用 */
export interface ComponentContractRefs {
  props?: string[]
  events?: string[]
  api?: string[]
}

export interface PropEntry {
  name: string
  type: string
  required: boolean
  default?: string
  description?: string
  /** JSON 示例值，面向 LLM/后端直接生成配置。 */
  examples?: unknown[]
  /** 指向 schemaNodes 的根节点 id。 */
  schemaNodeId?: string
  /**
   * 语义标签：该 prop 期望绑定的子组件 type（kebab-case）。
   *
   * 来源于 JSDoc `@componentRef xxx`，与 `schemaNodeId` 互补：
   * - `schemaNodeId` 提供结构（由 VCM 从 prop 类型反推）；
   * - `componentRef` 提供语义（AI 可据此识别这是一个子组件槽位）。
   */
  componentRef?: string
  /**
   * @internal Build-time 中间字段：VCM 提取阶段写入，随后由 generator
   * `compactProps` 转换为 `schemaNodeId`。不会出现在落盘 catalog 中。
   */
  schema?: PropSchema
}

export interface EmitEntry {
  name: string
  /** 事件类型签名 */
  type?: string
  /** 事件描述 */
  description?: string
  /** 指向 schemaNodes 的根节点 id。 */
  schemaNodeId?: string
  /**
   * Build-time 中间字段：仅在提取阶段被赋值，不会落盘。如需事件载荷语义，使用 schema。
   */
  payload?: Array<{ name: string; type: string }>
  /**
   * @internal Build-time 中间字段：VCM 提取阶段写入，随后由 generator
   * `compactEmits` 转换为 `schemaNodeId`。不会出现在落盘 catalog 中。
   */
  __payloadSchemas?: PropSchema[]
  /**
   * @internal Build-time 中间字段：事件 payload 参数说明，来自 defineEmits JSDoc
   * 或参数名兜底。不会出现在落盘 catalog 中。
   */
  __payloadParamDocs?: EmitPayloadParamDoc[]
}

export interface EmitPayloadParamDoc {
  name: string
  description?: string
}

/** JSON Schema 标准 type 名称。 */
export type JsonSchemaTypeName = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'

/** 对象 schema 中的属性条目。 */
export interface PropSchemaProperty extends PropSchema {
  /**
   * @internal 临时字段 — 仅在生成阶段使用
   * 暂存需要递归提取到 schemaNodes 的嵌套 schema
   * 最终 JSON 中不会包含此字段，会被替换为 $ref
   */
  __nestedSchema?: PropSchema
}
/**
 * 标准 JSON Schema 2020-12 子集。
 *
 * 约束：
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
  /** 引用其它 schema 定义；仅生成阶段使用。 */
  $ref?: string
  /** 描述。 */
  description?: string
  /** 标准 JSON Schema default annotation。 */
  default?: unknown
  /** 标准 JSON Schema examples annotation。 */
  examples?: unknown[]
}

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

/** 根级语义字段（组件对 rule.json 的结构化语义说明） */
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
  dataKeyPattern: CatalogConstraintEntry<string>
  /** 合法组件类型前缀 */
  validTypePrefixes: CatalogConstraintEntry<string[]>
  /** 合法聚合类型 */
  validAggregateTypes: CatalogConstraintEntry<string[]>
  /** 非字段容器类型（r-* 但不是字段） */
  nonFieldRTypes: CatalogConstraintEntry<string[]>
  /** 容器 → 语境映射 */
  containerContextMap: CatalogConstraintEntry<Record<string, string>>
  /** 容器子组件嵌套规则 */
  nestingRules: CatalogConstraintEntry<Record<string, NestingRule>>
}

export interface CatalogConstraintEntry<TValue> {
  /** 约束值，供校验器或后端直接消费。 */
  value: TValue
  /** LLM 可读说明：解释该约束限制什么、何时使用。 */
  description: string
  /** 可直接参考的合法示例。 */
  examples?: unknown[]
}

export interface NestingRule {
  /** 允许的子组件类型模式 */
  allowedChildren: string[]
  /** 禁止的子组件类型 */
  forbiddenChildren?: string[]
  /** 说明文本 */
  note?: string
}

/* --------------------------------------------------------------------------
 * 绑定行为描述符
 * ----------------------------------------------------------------------- */

/**
 * 组件绑定行为描述符（与运行时 ComponentBindingDescriptor 结构对齐）
 *
 * 声明一个组件类型在绑定管线中的角色和特征。
 * 构建时由 VCM props 自动推断（r-*）或静态声明（el-*）。
 */
export interface CatalogBindingDescriptor {
  /** LLM 可读绑定说明，解释该组件如何参与 dataKey/field/options/value 管线。 */
  description?: string
  /** 可直接参考的绑定配置示例。 */
  examples?: unknown[]
  /** 数据绑定委托：'table' | 'pagination' | 'form-element' */
  bindingDelegate?: 'table' | 'pagination' | 'form-element'
  /** dataKey 自解析（组件自行 consume PAGE_DATASET） */
  selfResolving?: boolean
  /** 数据容器（向子组件传递 DataSource） */
  dataContainer?: boolean
  /** 字段提供者（prop 属性表示字段名） */
  fieldProvider?: boolean
  /** 选项映射支持 */
  hasOptions?: boolean
  /** 值类型：'string' | 'boolean' | 'array' */
  valueType?: 'string' | 'boolean' | 'array'
  /** 操作组件（权限控制可见性） */
  actionComponent?: boolean
  /** 列容器（权限控制整列隐藏） */
  columnLike?: boolean
}

/* --------------------------------------------------------------------------
 * 治理契约（Vue 侧标准 -> AI 侧标准）
 * ----------------------------------------------------------------------- */

export interface CatalogGovernance {
  contracts: Record<string, GovernanceContract>
}

export interface GovernanceContract {
  layer: 'props' | 'events' | 'api'
  description: string
  members: string[]
}

/* --------------------------------------------------------------------------
 * API 全息表面（DataView / DataSet / 沙箱）
 * ----------------------------------------------------------------------- */

/** 全息 API 表面：组件 catalog 之外的编程接口 */
export interface ApiSurface {
  /** DataView 公共方法 */
  dataView: ApiMethodEntry[]
  /** DataSet 公共方法 */
  dataSet: ApiMethodEntry[]
  /** SparkData 命名空间函数 */
  sparkData: ApiMethodEntry[]
  /** IScriptContext 沙箱注入变量 */
  scriptContext: ApiMemberEntry[]
  /** IPageServiceCapability 方法 */
  pageService: ApiMethodEntry[]
}

/** API 方法条目 */
export interface ApiMethodEntry {
  name: string
  /** 方法签名（TypeScript 格式） */
  signature: string
  /** JSDoc 描述 */
  description?: string
  /** 参数列表 */
  params?: ApiParamEntry[]
  /** 返回类型 */
  returnType?: string
}

/** API 参数条目 */
export interface ApiParamEntry {
  name: string
  type: string
  required?: boolean
  description?: string
}

/** API 成员条目（属性或方法） */
export interface ApiMemberEntry {
  name: string
  type: string
  kind: 'property' | 'method'
  description?: string
}
