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
export type ComponentCatalog = {
  /** JSON Schema draft 标识；catalog envelope 内的 schema 引用遵循 2020-12。 */
  $schema: 'https://json-schema.org/draft/2020-12/schema'
  /** Schema 版本，遵循 semver */
  version: '3.0.0'
  /** 构建时间 ISO 8601 */
  buildTime: string
  /** 组件总数 */
  componentCount: number

  /** 组件条目：key = 组件 type（kebab-case），目录主入口。 */
  components: Record<string, ComponentEntry>

  /** 标准 JSON Schema definitions：key 必须等于 schema.title，复杂字段通过 `#/$defs/{type}` 引用。 */
  $defs?: Record<string, PropSchema>}

/**
 * Raw VCM 提取目录（完整 wrapper 结构）。
 *
 * 保留 version / buildTime / componentCount 元信息，
 * components 内为 vue-component-meta 的直接提取结果。
 */
export type RawComponentCatalog = {
  /** Schema 版本 */
  version: string
  /** 构建时间 ISO 8601 */
  buildTime: string
  /** 组件总数 */
  componentCount: number
  /** 组件条目：key = 组件 type（kebab-case） */
  components: Record<string, RawComponentEntry>}

export type RawComponentEntry = {
  type: string
  filePath: string
  props: PropEntry[]
  emits: EmitEntry[]}

/* --------------------------------------------------------------------------
 * 注册表
 * ----------------------------------------------------------------------- */

export type ComponentRegistry = {
  /** 容器组件 */
  containers: string[]
  /** 字段组件 */
  fields: string[]
  /** 分组组件 */
  groups: string[]
  /** 元概念（非真实组件，仅文档） */
  meta: string[]}

/* --------------------------------------------------------------------------
 * 组件条目
 * ----------------------------------------------------------------------- */

export type ComponentEntry = {
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
  propsInterface?: PropsInterfaceRef}

/**
 * Props 接口命名规范引用。
 *
 * 命名规范：组件 type `r-xxx` → 接口名 `RXxxProps`，
 * 定义在 `{ComponentName}.props.ts` 中并通过 barrel 导出。
 */
export type PropsInterfaceRef = {
  /** 接口名（如 `RTableProps`） */
  name: string
  /** 定义文件相对路径 */
  file: string
  /** 是否通过包入口公开导出 */
  exported: boolean}

/** 组件命中的治理契约引用 */
export type ComponentContractRefs = {
  props?: string[]
  events?: string[]
  api?: string[]}

export type PropEntry = {
  name: string
  /** TypeScript 展示类型；JSON Schema 关键字在 prop.schema.type。 */
  typeText: string
  required: boolean
  default?: string
  description?: string
  /** JSON 示例值，面向 LLM/后端直接生成配置。 */
  examples?: unknown[]
  /** 构建期 schema type 引用；落盘时转换为 JSON Schema `$ref`。 */
  schemaNodeId?: string
  /**
   * JSON Schema。复杂类型用 `{ "$ref": "#/$defs/真实Type" }` 指向 `$defs`。
   * 生成阶段也会临时存放完整 VCM schema，最终写盘前会瘦身为标准 JSON Schema。
   */
  schema?: PropSchema}

export type EmitEntry = {
  name: string
  /** 事件 payload 的 TypeScript 签名展示文本。 */
  typeText?: string
  /** 事件描述 */
  description?: string
  /** 构建期 schema type 引用；落盘时转换为 JSON Schema `$ref`。 */
  schemaNodeId?: string
  /**
   * @internal Build-time 中间字段：事件 payload 的 JSON Schema。
   * 落盘时会直接写入组件 type 的 emits[eventName]，不再提升为事件专属伪 type。
   */
  schema?: PropSchema
  /**
   * Build-time 中间字段：仅在提取阶段被赋值，不会落盘。如需事件载荷语义，使用 schema。
   */
  payload?: Array<{ name: string; type: string }>
  /**
   * @internal Build-time 中间字段：VCM 提取阶段写入，随后由 generator
   * `compactEmits` 转换为 schema type 引用。不会出现在落盘 catalog 中。
   */
  __payloadSchemas?: PropSchema[]
  /**
   * @internal Build-time 中间字段：事件 payload 参数说明，来自 defineEmits JSDoc
   * 或参数名兜底。不会出现在落盘 catalog 中。
   */
  __payloadParamDocs?: EmitPayloadParamDoc[]}

export type EmitPayloadParamDoc = {
  name: string
  description?: string}

/** JSON Schema 标准 type 名称。 */
export type JsonSchemaTypeName = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'

/** 对象 schema 中的属性条目。 */
export type PropSchemaProperty = PropSchema & {
  /**
     * @internal 临时字段 — 仅在生成阶段使用
     * 暂存需要递归提取到 schema type 池的嵌套 schema
     * 最终 JSON 中不会包含此字段，会被替换为 $ref
     */
    __nestedSchema?: PropSchema}
/**
 * 标准 JSON Schema 2020-12 子集。
 *
 * 约束：
 * - 不使用自定义 kind 字段；
 * - 复杂对象以真实 type 为键进入 `$defs`；
 * - TypeScript 类型名使用标准 `title` 表达，不占用 JSON Schema `type`。
 */
export type PropSchema = {
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
  examples?: unknown[]}

/** 根级语义字段（组件对 rule.json 的结构化语义说明） */
export type RootFieldEntry = {
  name: string
  type: string
  description: string
  /** 子字段（如 filter.columns, toolbar.items） */
  children?: RootFieldEntry[]}

/* --------------------------------------------------------------------------
 * 平台约束（校验器复用）
 * ----------------------------------------------------------------------- */

export type PlatformConstraints = {
  /** DataViewKey字段正则（字符串形式，校验器重建 RegExp） */
  dataViewKeyPattern: CatalogConstraintEntry<string>
  /** 合法组件类型前缀 */
  validTypePrefixes: CatalogConstraintEntry<string[]>
  /** 合法聚合类型 */
  validAggregateTypes: CatalogConstraintEntry<string[]>
  /** 非字段容器类型（r-* 但不是字段） */
  nonFieldRTypes: CatalogConstraintEntry<string[]>
  /** 容器 → 语境映射 */
  containerContextMap: CatalogConstraintEntry<Record<string, string>>
  /** 容器子组件嵌套规则 */
  nestingRules: CatalogConstraintEntry<Record<string, NestingRule>>}

export type CatalogConstraintEntry<TValue> = {
  /** 约束值，供校验器或后端直接消费。 */
  value: TValue
  /** LLM 可读说明：解释该约束限制什么、何时使用。 */
  description: string
  /** 可直接参考的合法示例。 */
  examples?: unknown[]}

export type NestingRule = {
  /** 允许的子组件类型模式 */
  allowedChildren: string[]
  /** 禁止的子组件类型 */
  forbiddenChildren?: string[]
  /** 说明文本 */
  note?: string}

/* --------------------------------------------------------------------------
 * 绑定行为描述符
 * ----------------------------------------------------------------------- */

/**
 * 组件绑定行为描述符（与运行时 ComponentBindingDescriptor 结构对齐）
 *
 * 声明一个组件类型在绑定管线中的角色和特征。
 * 构建时由 VCM props 自动推断（r-*）或静态声明（el-*）。
 */
export type CatalogBindingDescriptor = {
  /** LLM 可读绑定说明，解释该组件如何参与 dataViewKey、dataMember、dataField、field、options、value 管线。 */
  description?: string
  /** 可直接参考的绑定配置示例。 */
  examples?: unknown[]
  /** 数据绑定委托：'table' | 'pagination' | 'form-element' */
  bindingDelegate?: 'table' | 'pagination' | 'form-element'
  /** DataView 自解析（组件自行 consume PAGE_DATASET） */
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
  columnLike?: boolean}

/* --------------------------------------------------------------------------
 * 治理契约（Vue 侧标准 -> AI 侧标准）
 * ----------------------------------------------------------------------- */

export type CatalogGovernance = {
  contracts: Record<string, GovernanceContract>}

export type GovernanceContract = {
  layer: 'props' | 'events' | 'api'
  description: string
  members: string[]}

/* --------------------------------------------------------------------------
 * API 全息表面（DataView / DataSet / 沙箱）
 * ----------------------------------------------------------------------- */

/** 全息 API 表面：组件 catalog 之外的编程接口 */
export type ApiSurface = {
  /** DataView 公共方法 */
  dataView: ApiMethodEntry[]
  /** DataSet 公共方法 */
  dataSet: ApiMethodEntry[]
  /** SparkData 命名空间函数 */
  sparkData: ApiMethodEntry[]
  /** ScriptContext 沙箱注入变量 */
  scriptContext: ApiMemberEntry[]
  /** IPageServiceCapability 方法 */
  pageService: ApiMethodEntry[]}

/** API 方法条目 */
export type ApiMethodEntry = {
  name: string
  /** 方法签名（TypeScript 格式） */
  signature: string
  /** JSDoc 描述 */
  description?: string
  /** 参数列表 */
  params?: ApiParamEntry[]
  /** 返回类型 */
  returnType?: string}

/** API 参数条目 */
export type ApiParamEntry = {
  name: string
  type: string
  required?: boolean
  description?: string}

/** API 成员条目（属性或方法） */
export type ApiMemberEntry = {
  name: string
  type: string
  kind: 'property' | 'method'
  description?: string}
