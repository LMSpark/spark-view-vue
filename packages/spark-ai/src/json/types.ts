/**
 * ═══════════════════════════════════════════════════════════════
 * schema/types.ts — LLM JSON Schema 类型定义（单一事实源 SSOT）
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】最底层基础类型，被 module-semantic 和 host 两层共同依赖。
 *   本文件不依赖包内任何其他模块。
 *
 * 【设计决策】
 *   - 使用标准 JSON Schema (Draft 2020-12 子集)，不再使用项目私有 DSL。
 *   - 旧的 kind / 叶子描述字符串 / 简写对象根 已被废弃。
 *   - 函数 paramsSchema 和 payload guide 统一使用本文件定义的类型。
 *
 * 【消费方】schema/helpers.ts、schema/validator.ts、module-semantic/protocol/module-kind.ts
 *
 * ═══════════════════════════════════════════════════════════════
 * 类型层级（自底向上）：
 *
 *   AiJsonValue          — JSON 可序列化的原子值
 *     └─ AiJsonObject    — 键值对对象
 *
 *   AiJsonSchemaType     — JSON Schema type 字段允许的字符串枚举
 *
 *   AiJsonSchema         — Schema 节点（boolean | AiJsonSchemaObject）
 *     └─ AiJsonSchemaObject — 完整 Schema 节点（type/properties/items 等）
 * ═══════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · JSON 值类型 — 参数协议中允许持久化的值域
// ═══════════════════════════════════════════════════════════════

/**
 * 参数协议允许直接持久化的 JSON 值。
 * 不含 function、undefined、symbol、bigint 等运行时形态。
 * 这是 LLM 参数传递和结果返回的值域基础。
 */
export type AiJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly AiJsonValue[]
  | AiJsonObject

/** 参数协议中的 JSON 对象：key → AiJsonValue 映射 */
export type AiJsonObject = { readonly [key: string]: AiJsonValue }

/** LLM 函数/业务启动参数对象：运行时宽形态，key → AiJsonValue。 */
export type AiJsonParams = Readonly<Record<string, AiJsonValue>>

/**
 * LLM 参数对象的具名字段形态。
 *
 * 与 AiJsonParams 不同，本类型不引入 string 索引签名，避免 keyof 退化为 string。
 * 具体业务输入如 PageDesignRunInput 应使用它，以保留 identityField 的字段级约束。
 */
export type AiJsonParamShape<TShape extends object> = Readonly<TShape>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · Schema 类型枚举 — JSON Schema type 字段的合法值
// ═══════════════════════════════════════════════════════════════

/**
 * JSON Schema type 字段允许的类型字符串。
 * 支持联合类型数组，如 ['string', 'null'] 表示可选字符串。
 */
export type AiJsonSchemaType =
  | 'null'
  | 'boolean'
  | 'object'
  | 'array'
  | 'number'
  | 'integer'
  | 'string'

/**
 * JSON Schema 节点。
 * - `true` : 接受任意值（无约束）
 * - `false`: 拒绝任何值（用于禁止某字段）
 * - `AiJsonSchemaObject`: 完整约束节点
 */
export type AiJsonSchema = boolean | AiJsonSchemaObject

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · Schema 节点 — 标准 JSON Schema 完整约束描述
// ═══════════════════════════════════════════════════════════════

/**
 * 标准 JSON Schema 节点（Draft 2020-12 常用子集）。
 *
 * 覆盖以下特性：
 *   - 类型声明：type / title / description
 *   - 对象约束：properties / required / additionalProperties
 *   - 数组约束：items / prefixItems
 *   - 枚举/常量：enum / const
 *   - 组合校验：oneOf / anyOf / allOf / not
 *   - 字符串校验：maxLength / minLength / pattern / format
 *   - 数字校验：minimum / maximum
 *   - 引用与示例：$ref / default / examples
 *
 * 禁止旧 DSL 的 'kind' 字段。
 */
export type AiJsonSchemaObject = {
  /** 保留标准 JSON Schema 扩展关键字与 resultSchema 文档型字段 */
  readonly [keyword: string]: unknown

  // ── 引用 ──
  /** JSON Reference，引用另一个 schema（可选） */
  readonly $ref?: string

  // ── 类型元数据 ──
  /** 数据类型，支持联合类型数组 */
  readonly type?: AiJsonSchemaType | readonly AiJsonSchemaType[]
  /** 类型标题（可选） */
  readonly title?: string
  /** 类型描述，会展示给 LLM */
  readonly description?: string

  // ── 对象属性约束 ──
  /** 属性定义：属性名 → Schema */
  readonly properties?: Readonly<Record<string, AiJsonSchema>>
  /** 必填属性名列表 */
  readonly required?: readonly string[]
  /** 是否允许额外属性：false=拒绝，true=接受任意，AiJsonSchema=按 schema 校验 */
  readonly additionalProperties?: AiJsonSchema

  // ── 数组项约束 ──
  /** 数组项 Schema（普通数组） */
  readonly items?: AiJsonSchema
  /** 元组前缀项 Schema（固定长度元组） */
  readonly prefixItems?: readonly AiJsonSchema[]

  // ── 枚举与常量 ──
  /** 枚举值列表，值必须是有效 JSON 类型 */
  readonly enum?: ReadonlyArray<string | number | boolean | null>
  /** 常量值 */
  readonly const?: string | number | boolean | null

  // ── 默认值与示例 ──
  /** 默认值 */
  readonly default?: AiJsonValue
  /** 示例值列表 */
  readonly examples?: readonly AiJsonValue[]

  // ── 组合 schema ──
  /** 必须匹配其中一个 */
  readonly oneOf?: readonly AiJsonSchema[]
  /** 匹配任意一个 */
  readonly anyOf?: readonly AiJsonSchema[]
  /** 必须匹配所有 */
  readonly allOf?: readonly AiJsonSchema[]
  /** 不能匹配此 schema */
  readonly not?: AiJsonSchema

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
