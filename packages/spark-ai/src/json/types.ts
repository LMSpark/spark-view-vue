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
