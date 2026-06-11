/**
 * @module @spark-appworks/spark-ai:json/types
 * 职责：提供 AI JSON 参数和 schema 处理中的 types 能力，支撑输入校验、类型收敛和运行时保护。
 * 边界：只处理 JSON 值与 schema，不依赖 Vue、Host 或业务组件。
 * AI用途：当业务输入需要校验、规整或解释 JSON schema 时，用本模块确认基础 JSON 契约。
 */
/**
 * ═══════════════════════════════════════════════════════════════
 * json/types.ts — AI JSON Schema 类型（deprecated re-export 层）
 * ═══════════════════════════════════════════════════════════════
 *
 * 【迁移说明】
 *   所有 JSON 值/Schema 类型已统一到 @spark-appworks/spark-json-document。
 *   本文件仅保留旧名称作为 deprecated alias，消费方应迁移到新名称：
 *
 *   AiJsonValue       → JsonValue
 *   AiJsonObject      → JsonObject
 *   AiJsonParams      → JsonParams
 *   AiJsonParamShape  → JsonParamShape
 *   AiJsonSchemaType  → JsonSchemaType
 *   AiJsonSchema      → JsonSchema
 *   AiJsonSchemaObject → JsonSchemaObject
 *
 * ═══════════════════════════════════════════════════════════════
 */

export type {
  JsonValue as AiJsonValue,
  JsonObject as AiJsonObject,
  JsonParams as AiJsonParams,
  JsonParamShape as AiJsonParamShape,
} from '@spark-appworks/spark-json-document'

export type {
  JsonSchemaType as AiJsonSchemaType,
  JsonSchema as AiJsonSchema,
  JsonSchemaObject as AiJsonSchemaObject,
} from '@spark-appworks/spark-json-document'
