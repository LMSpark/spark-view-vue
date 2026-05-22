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
 *   LlmJsonValue          — JSON 可序列化的原子值
 *     └─ LlmJsonObject    — 键值对对象
 *
 *   LlmJsonSchemaType     — JSON Schema type 字段允许的字符串枚举
 *
 *   LlmJsonSchema         — Schema 节点（boolean | LlmJsonSchemaObject）
 *     └─ LlmJsonSchemaObject — 完整 Schema 节点（type/properties/items 等）
 *
 *   LlmParameterSchemaRoot — 函数 paramsSchema 的根节点（必须是 type=object）
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
export type LlmJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly LlmJsonValue[]
  | LlmJsonObject

/** 参数协议中的 JSON 对象：key → LlmJsonValue 映射 */
export type LlmJsonObject = { readonly [key: string]: LlmJsonValue }

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · Schema 类型枚举 — JSON Schema type 字段的合法值
// ═══════════════════════════════════════════════════════════════

/**
 * JSON Schema type 字段允许的类型字符串。
 * 支持联合类型数组，如 ['string', 'null'] 表示可选字符串。
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
 * JSON Schema 节点。
 * - `true` : 接受任意值（无约束）
 * - `false`: 拒绝任何值（用于禁止某字段）
 * - `LlmJsonSchemaObject`: 完整约束节点
 */
export type LlmJsonSchema = boolean | LlmJsonSchemaObject

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
export type LlmJsonSchemaObject = {
  /** 保留标准 JSON Schema 扩展关键字与 resultSchema 文档型字段 */
  readonly [keyword: string]: unknown

  // ── 引用 ──
  /** JSON Reference，引用另一个 schema（可选） */
  readonly $ref?: string

  // ── 类型元数据 ──
  /** 数据类型，支持联合类型数组 */
  readonly type?: LlmJsonSchemaType | readonly LlmJsonSchemaType[]
  /** 类型标题（可选） */
  readonly title?: string
  /** 类型描述，会展示给 LLM */
  readonly description?: string

  // ── 对象属性约束 ──
  /** 属性定义：属性名 → Schema */
  readonly properties?: Readonly<Record<string, LlmJsonSchema>>
  /** 必填属性名列表 */
  readonly required?: readonly string[]
  /** 是否允许额外属性：false=拒绝，true=接受任意，LlmJsonSchema=按 schema 校验 */
  readonly additionalProperties?: LlmJsonSchema

  // ── 数组项约束 ──
  /** 数组项 Schema（普通数组） */
  readonly items?: LlmJsonSchema
  /** 元组前缀项 Schema（固定长度元组） */
  readonly prefixItems?: readonly LlmJsonSchema[]

  // ── 枚举与常量 ──
  /** 枚举值列表，值必须是有效 JSON 类型 */
  readonly enum?: ReadonlyArray<string | number | boolean | null>
  /** 常量值 */
  readonly const?: string | number | boolean | null

  // ── 默认值与示例 ──
  /** 默认值 */
  readonly default?: LlmJsonValue
  /** 示例值列表 */
  readonly examples?: readonly LlmJsonValue[]

  // ── 组合 schema ──
  /** 必须匹配其中一个 */
  readonly oneOf?: readonly LlmJsonSchema[]
  /** 匹配任意一个 */
  readonly anyOf?: readonly LlmJsonSchema[]
  /** 必须匹配所有 */
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

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 参数根 — 函数 paramsSchema 的顶层约束
// ═══════════════════════════════════════════════════════════════

/**
 * 函数 paramsSchema / 参数 payload guide 共用的根 schema。
 *
 * 约定：根节点 type 必须是 'object'，保证 LLM 传入的参数始终是一个对象。
 * 当前直接继承 LlmJsonSchemaObject，不添加额外字段。
 */
export type LlmParameterSchemaRoot = LlmJsonSchemaObject
