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

  /**
   * schema 池：所有复杂 schema 仅在此处存一份，组件属性通过 schemaRef 引用。
   *
   * 生成侧负责去重，消费侧按组件按需回填拼接。
   */
  schemaPool?: Record<string, PropSchema>

  /** API 全息表面：DataView / DataSet / 沙箱注入变量的公共方法签名 */
  apiSurface?: ApiSurface

  /** 平台约束（校验器使用） */
  constraints: PlatformConstraints

  /**
   * 规范化主模型（长期目标，治理优先）
   *
   * 说明：
   * - 该模型通过字典 + 引用（refs）表达组件结构，减少重复信息
   * - AI 侧应优先消费此模型做约束推理与生成
   */
  canonical?: CatalogCanonicalModel

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

/* --------------------------------------------------------------------------
 * 规范化主模型（长期目标）
 * ----------------------------------------------------------------------- */

export interface CatalogCanonicalModel {
  dictionaries: CatalogCanonicalDictionaries
  components: Record<string, CatalogCanonicalComponent>
}

export interface CatalogCanonicalDictionaries {
  props: Record<string, PropEntry>
  emits: Record<string, EmitEntry>
}

export interface CatalogCanonicalComponent {
  type: string
  category: ComponentEntry['category']
  description: string
  filePath?: string
  propRefs: string[]
  emitRefs: string[]
  source: ComponentEntry['source']
  binding?: CatalogBindingDescriptor
  contracts?: ComponentContractRefs
  provides?: string[]
  consumes?: string[]
  notes?: string
}


export interface PropEntry {
  name: string
  type: string
  required: boolean
  default?: string
  description?: string
  /** schema 池引用 key（首选） */
  schemaRef?: string
  /**
   * 语义标签：该 prop 期望绑定的子组件 type（kebab-case）。
   *
   * 来源于 JSDoc `@componentRef xxx`，与 `schemaRef` 互补：
   * - `schemaRef` 提供结构（由 VCM 从 prop 类型反推）；
   * - `componentRef` 提供语义（AI 可据此识别这是一个子组件槽位）。
   */
  componentRef?: string
  /**
   * Build-time 中间字段：VCM 提取阶段写入，随后由 generator `compactProps`
   * 转换为 `schemaRef` （并汇入 catalog.schemaPool）。**不会出现在落盘 catalog 中**。
   */
  schema?: PropSchema
}

export interface EmitEntry {
  name: string
  /** 事件类型签名 */
  type?: string
  /** 事件描述 */
  description?: string
  /** schema 池引用 key 列表（首选） */
  schemaRefs?: string[]
  /**
   * Build-time 中间字段：VCM 提取阶段写入，随后由 generator `compactEmits`
   * 转换为 `schemaRefs` 并汇入 catalog.schemaPool。**不会出现在落盘 catalog 中**。
   */
  schema?: PropSchema[]
  /**
   * Build-time 中间字段：仅在提取阶段被赋值，不会落盘。如需事件载荷语义，使用 schemaRefs。
   */
  payload?: Array<{ name: string; type: string }>
}

/** 对象 schema 中的属性条目 */
export interface PropSchemaProperty {
  name: string
  type: string
  required?: boolean
  description?: string
  /** 嵌套 schema 池引用 key（用于递归展开结构化对象类型） */
  schemaRef?: string
  /**
   * @internal 临时字段 — 仅在生成阶段使用
   * 暂存需要递归提取到 schemaPool 的嵌套 schema
   * 最终 JSON 中不会包含此字段，会被替换为 schemaRef
   */
  __nestedSchema?: PropSchema
}
/**
 * 扁平类型 Schema（非递归）
 *
 * 约束：schemaPool 内不再出现 schema 嵌套对象；
 * 消费层按 type / variants / itemTypes / paramTypes 再现嵌套。
 */
export type PropSchema =
  | { kind: 'object'; type: string; properties: Record<string, PropSchemaProperty> }
  | { kind: 'enum'; type: string; variants: string[] }
  | { kind: 'array'; type: string; itemTypes: string[] }
  | { kind: 'event'; type: string; paramTypes: string[] }

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
