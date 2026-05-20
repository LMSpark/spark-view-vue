/**
 * Parameter Schema（单一事实源）
 *
 * 函数 `paramsSchema` 与 payload guide 统一使用标准 JSON Schema object。
 * 旧的 spark-ai 私有 DSL（`kind` / 叶子描述字符串 / 简写对象根）不再是合法输入；
 * 需要在注册源头显式输出 `type`、`properties`、`items`、`required` 等 JSON Schema 字段。
 */

// =========================================================
// 一、对外类型定义
// =========================================================

/** 参数协议允许直接持久化的 JSON 值；不包含 function、undefined、symbol、bigint 等运行时形态。 */
export type LlmJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly LlmJsonValue[]
  | LlmJsonObject

/** 参数协议中的 JSON 对象。 */
export interface LlmJsonObject { readonly [key: string]: LlmJsonValue }

export type LlmJsonSchemaType =
  | 'null'
  | 'boolean'
  | 'object'
  | 'array'
  | 'number'
  | 'integer'
  | 'string'

export type LlmJsonSchema = boolean | LlmJsonSchemaObject

/** 标准 JSON Schema 节点。保留有限扩展字段，但不允许 `kind`。 */
export interface LlmJsonSchemaObject {
  readonly $ref?: string
  readonly type?: LlmJsonSchemaType | readonly LlmJsonSchemaType[]
  readonly title?: string
  readonly description?: string
  readonly properties?: Readonly<Record<string, LlmJsonSchema>>
  readonly required?: readonly string[]
  readonly items?: LlmJsonSchema
  readonly prefixItems?: readonly LlmJsonSchema[]
  readonly additionalProperties?: LlmJsonSchema
  // 这里不再为 JS 基础类型保留类型别名，直接使用原生联合类型。
  readonly enum?: ReadonlyArray<string | number | boolean | null>
  readonly const?: string | number | boolean | null
  readonly default?: LlmJsonValue
  readonly examples?: readonly LlmJsonValue[]
  readonly oneOf?: readonly LlmJsonSchema[]
  readonly anyOf?: readonly LlmJsonSchema[]
  readonly allOf?: readonly LlmJsonSchema[]
  readonly not?: LlmJsonSchema
  readonly maxLength?: number
  readonly minLength?: number
  readonly minimum?: number
  readonly maximum?: number
  readonly pattern?: string
  readonly format?: string
}

/** 函数 paramsSchema / 参数 payload guide 共用的根 schema。 */
export type LlmParameterSchemaRoot = LlmJsonSchemaObject
