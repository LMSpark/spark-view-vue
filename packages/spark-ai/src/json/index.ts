/**
 * @module @spark-appworks/spark-ai:json/index
 * 职责：提供 AI JSON 参数和 schema 处理中的 index 能力，支撑输入校验、类型收敛和运行时保护。
 * 边界：只处理 JSON 值与 schema，不依赖 Vue、Host 或业务组件。
 * AI用途：当业务输入需要校验、规整或解释 JSON schema 时，用本模块确认基础 JSON 契约。
 */
/**
 * ═══════════════════════════════════════════════════════════════
 * json/index.ts — SPARK AI json 公共入口（deprecated re-export 层）
 * ═══════════════════════════════════════════════════════════════
 *
 * 【迁移说明】所有 JSON/Schema 类型和工具已统一到 @spark-appworks/spark-json-document。
 *   本入口保留旧名称作为 deprecated alias。
 *   新代码应直接从 @spark-appworks/spark-json-document 导入。
 * ═══════════════════════════════════════════════════════════════
 */

// ── 类型：JSON Schema 核心类型（deprecated aliases）──────────
export type {
  AiJsonObject,
  AiJsonParamShape,
  AiJsonParams,
  AiJsonSchema,
  AiJsonSchemaObject,
  AiJsonSchemaType,
  AiJsonValue,
} from './types'

// ── 值：Schema 便捷构造器（deprecated re-exports）────────────
export {
  anySchema,
  arraySchema,
  booleanSchema,
  enumSchema,
  noParamsSchema,
  numberSchema,
  objectSchema,
  paramsSchema,
  stringSchema,
} from './helpers'

export type {
  BooleanSchemaOptions,
  EnumSchemaOptions,
  NumberSchemaOptions,
  ObjectSchemaOptions,
  StringSchemaOptions,
} from './helpers'

// ── 值 + 类型：参数校验器（deprecated aliases）───────────────
export {
  AiJsonSchemaValidator,
} from './validator'

export type {
  AiJsonValidationIssue,
  AiJsonValidationResult,
  AiJsonSchemaValidateOptions,
} from './validator'

// ── 值：JSON 值规整（deprecated re-exports）──────────────────
export {
  coerceJsonValue,
  coerceStrictJsonValue,
} from './coercion'
