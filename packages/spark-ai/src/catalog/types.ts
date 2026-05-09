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
 * 3. ComponentEntry/Registry：按组件类型做目录查询与能力发现。
 * 4. Prop/Emit/Schema：按组件读取属性、事件和嵌套结构。
 * 5. Canonical/Shared/Governance：做跨组件归一化、共享类型复用与治理约束。
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
  version: string
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
  version: string
  /** 构建时间。 */
  buildTime: string
  /** 组件总数。 */
  componentCount: number
  /** 分类注册表（容器/字段/分组/元组件）。 */
  registry?: ComponentRegistry
  /** 组件主索引：type -> 组件详情。 */
  components: Record<string, ComponentEntry>
  /** 可选 schema 池：避免大对象在 props 上重复内联。 */
  schemaPool?: Record<string, PropSchema>
  /** 平台约束：dataKey、嵌套规则等。 */
  constraints?: PlatformConstraints
  /** 规范化模型（去重后的字典 + 引用关系）。 */
  canonical?: CatalogCanonicalModel
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
  /** 指向 schemaPool 的键。 */
  schemaRef?: string
  /**
   * 语义标签：该 prop 期望绑定的子组件 type（kebab-case）。
   * 来源于 JSDoc `@componentRef xxx`；与 schemaRef 互补（结构由 schemaRef 提供）。
   */
  componentRef?: string
}

/**
 * prop schema 抽象模型。
 *
 * 说明：
 * - object/enum/array/event 四种 kind 覆盖目录消费常见场景；
 * - 消费侧通常按 kind 分派渲染或校验逻辑。
 */
export type PropSchema =
  | { kind: 'object'; type: string; properties: Record<string, PropSchemaProperty> }
  | { kind: 'enum'; type: string; variants: string[] }
  | { kind: 'array'; type: string; itemTypes: string[] }
  | { kind: 'event'; type: string; paramTypes: string[] }

export interface PropSchemaProperty {
  /** 属性名。 */
  name: string
  /** 属性类型。 */
  type: string
  /** 是否必填。 */
  required?: boolean
  /** 属性说明。 */
  description?: string
  /** 嵌套结构 schema（当该属性本身也是复杂类型时递归展开） */
  schema?: PropSchema
}

/** 单个 emit 事件定义。 */
export interface EmitEntry {
  /** 事件名。 */
  name: string
  /** 事件类型签名（可选）。 */
  type?: string
  /** 事件说明。 */
  description?: string
  /** 关联 schema 引用列表。 */
  schemaRefs?: string[]
}

// =========================================================
// 五、规范化模型（Canonical）
// =========================================================

/** 规范化目录模型（字典去重 + 组件引用）。 */
export interface CatalogCanonicalModel {
  /** 去重后的 props/emits 字典。 */
  dictionaries: CatalogCanonicalDictionaries
  /** 组件规范化视图。 */
  components: Record<string, CatalogCanonicalComponent>
}

/** 规范化字典集合。 */
export interface CatalogCanonicalDictionaries {
  /** prop 字典。 */
  props: Record<string, PropEntry>
  /** emit 字典。 */
  emits: Record<string, EmitEntry>
}

/** 规范化后的单组件定义。 */
export interface CatalogCanonicalComponent {
  /** 组件类型。 */
  type: string
  /** 非空分类。 */
  category: NonNullable<ComponentEntry['category']>
  /** 组件说明。 */
  description: string
  /** 源文件路径。 */
  filePath?: string
  /** prop 字典引用键。 */
  propRefs: string[]
  /** emit 字典引用键。 */
  emitRefs: string[]
  /** 来源标记。 */
  source?: NonNullable<ComponentEntry['source']>
  /** 绑定描述。 */
  binding?: CatalogBindingDescriptor
  /** 契约引用。 */
  contracts?: ComponentContractRefs
  /** provides 列表。 */
  provides?: string[]
  /** consumes 列表。 */
  consumes?: string[]
  /** 备注。 */
  notes?: string
}

// =========================================================
// 六、绑定语义 / 治理契约 / 共享类型
// =========================================================

/** 组件绑定语义描述符。 */
export interface CatalogBindingDescriptor {
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
// 七、平台约束与嵌套规则
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
  dataKeyPattern: string
  /** 合法 type 前缀。 */
  validTypePrefixes: string[]
  /** 合法聚合类型集合。 */
  validAggregateTypes: string[]
  /** 非字段组件 r-type 集合。 */
  nonFieldRTypes: string[]
  /** 容器上下文映射。 */
  containerContextMap: Record<string, string>
  /** 嵌套规则表。 */
  nestingRules: Record<string, NestingRule>
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
