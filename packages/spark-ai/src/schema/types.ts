/**
 * Parameter Schema（单一事实源）。
 *
 * 函数 paramsSchema 与 payload guide 统一使用标准 JSON Schema object。
 * 旧的 spark-ai 私有 DSL（kind / 叶子描述字符串 / 简写对象根）不再是合法输入；
 * 需要在注册源头显式输出 type、properties、items、required 等 JSON Schema 字段。
 *
 * 类型层级关系：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ LlmParameterSchemaRoot（参数根，继承 LlmJsonSchemaObject）     │
 * │   └─ LlmJsonSchemaObject（标准 JSON Schema 节点）             │
 * │        ├─ type: LlmJsonSchemaType                             │
 * │        ├─ properties: Record<string, LlmJsonSchema>           │
 * │        ├─ items: LlmJsonSchema                                │
 * │        └─ ...（validation/combining/ref 等字段）               │
 * │   └─ LlmJsonSchema = boolean | LlmJsonSchemaObject            │
 * │                                                                │
 * │ LlmJsonSchemaObject 支持的标准 JSON Schema 特性：               │
 * │ - 类型：null/boolean/object/array/number/integer/string        │
 * │ - 对象：properties/required/additionalProperties               │
 * │ - 数组：items/prefixItems                                      │
 * │ - 校验：minLength/maxLength/minimum/maximum/pattern/format      │
 * │ - 枚举/常量：enum/const                                        │
 * │ - 组合：oneOf/anyOf/allOf/not                                  │
 * │ - 引用：$ref                                                   │
 * │ - 默认值/示例：default/examples                                │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 使用约定：
 * - 函数 paramsSchema 的根节点 type 必须是 'object'
 * - properties 的值类型是 LlmJsonSchema（支持 boolean 或 object）
 * - 不保留 'kind' 字段，不再支持项目私有 DSL
 */

// ═══════════════════════════════════════════════════════
// 1. JSON 值类型（可被序列化/反序列化的值）
// ═══════════════════════════════════════════════════════

/**
 * 参数协议允许直接持久化的 JSON 值。
 * 不包含 function、undefined、symbol、bigint 等运行时形态。
 * 这是 LLM 参数传递和结果返回的值域基础。
 */
export type LlmJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly LlmJsonValue[]
  | LlmJsonObject

/** 参数协议中的 JSON 对象：key-value 映射，value 为 LlmJsonValue */
export interface LlmJsonObject { readonly [key: string]: LlmJsonValue }

// ═══════════════════════════════════════════════════════
// 2. Schema 类型（JSON Schema type 字段允许的值）
// ═══════════════════════════════════════════════════════

/**
 * JSON Schema 类型枚举。
 * 支持联合类型（如 ['string', 'null'] 表示可选字符串）。
 */
export type LlmJsonSchemaType =
  | 'null'
  | 'boolean'
  | 'object'
  | 'array'
  | 'number'
  | 'integer'
  | 'string'

/**
 * JSON Schema 节点：可以是 boolean（true=接受任意值, false=拒绝任何值）
 * 或完整的 LlmJsonSchemaObject。
 */
export type LlmJsonSchema = boolean | LlmJsonSchemaObject

// ═══════════════════════════════════════════════════════
// 3. Schema 节点（标准 JSON Schema 子集）
// ═══════════════════════════════════════════════════════

/**
 * 标准 JSON Schema 节点。
 * 覆盖 JSON Schema Draft 2020-12 的常用子集，
 * 用于定义 LLM 函数参数的结构和校验规则。
 *
 * 保留有限扩展字段，但不允许旧 DSL 的 'kind' 字段。
 */
export interface LlmJsonSchemaObject {
  /** 保留标准 JSON Schema 扩展关键字与 resultSchema 文档型字段。 */
  readonly [keyword: string]: unknown

  // ── 引用 ──
  /** JSON Reference，引用另一个 schema（可选） */
  readonly $ref?: string

  // ── 类型 ──
  /** 数据类型，支持联合类型数组 */
  readonly type?: LlmJsonSchemaType | readonly LlmJsonSchemaType[]
  /** 类型标题（可选） */
  readonly title?: string
  /** 类型描述，会展示给 LLM */
  readonly description?: string

  // ── 对象属性 ──
  /** 属性定义：属性名 → Schema */
  readonly properties?: Readonly<Record<string, LlmJsonSchema>>
  /** 必填属性名列表 */
  readonly required?: readonly string[]
  /** 是否允许额外属性：false=拒绝，true=接受任意，LlmJsonSchema=按 schema 校验 */
  readonly additionalProperties?: LlmJsonSchema

  // ── 数组项 ──
  /** 数组项 Schema（适用于普通数组） */
  readonly items?: LlmJsonSchema
  /** 元组前缀项 Schema（适用于固定长度元组） */
  readonly prefixItems?: readonly LlmJsonSchema[]

  // ── 枚举与常量 ──
  /** 枚举值列表，值必须是有效的 JSON 类型 */
  readonly enum?: ReadonlyArray<string | number | boolean | null>
  /** 常量值 */
  readonly const?: string | number | boolean | null

  // ── 默认值与示例 ──
  /** 默认值 */
  readonly default?: LlmJsonValue
  /** 示例值列表 */
  readonly examples?: readonly LlmJsonValue[]

  // ── 组合 schema ──
  /** 必须匹配其中一个 schema */
  readonly oneOf?: readonly LlmJsonSchema[]
  /** 匹配任意一个 schema */
  readonly anyOf?: readonly LlmJsonSchema[]
  /** 必须匹配所有 schema */
  readonly allOf?: readonly LlmJsonSchema[]
  /** 不能匹配此 schema */
  readonly not?: LlmJsonSchema

  // ── 字符串校验 ──
  /** 最大长度 */
  readonly maxLength?: number
  /** 最小长度 */
  readonly minLength?: number
  /** 正则表达式模式 */
  readonly pattern?: string
  /** 格式（如 email、date-time、uri 等） */
  readonly format?: string

  // ── 数字校验 ──
  /** 最小值 */
  readonly minimum?: number
  /** 最大值 */
  readonly maximum?: number
}

// ═══════════════════════════════════════════════════════
// 4. 参数根（函数 paramsSchema 的根节点）
// ═══════════════════════════════════════════════════════

/**
 * 函数 paramsSchema / 参数 payload guide 共用的根 schema。
 *
 * 当前直接继承 LlmJsonSchemaObject，不添加额外字段。
 * 约定：函数 paramsSchema 的根节点 type 必须是 'object'，
 * 这保证了 LLM 传入的参数始终是一个对象。
 */
export interface LlmParameterSchemaRoot extends LlmJsonSchemaObject {}
