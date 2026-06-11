/**
 * @module @spark-appworks/spark-ai:json/helpers
 * 职责：提供 AI JSON 参数和 schema 处理中的 helpers 能力，支撑输入校验、类型收敛和运行时保护。
 * 边界：只处理 JSON 值与 schema，不依赖 Vue、Host 或业务组件。
 * AI用途：当业务输入需要校验、规整或解释 JSON schema 时，用本模块确认基础 JSON 契约。
 */
/**
 * json/helpers.ts — JSON Schema 便捷构造器（deprecated re-export 层）
 *
 * 【迁移说明】所有构造器已统一到 @spark-appworks/spark-json-document。
 *   消费方应改为从 @spark-appworks/spark-json-document 直接导入。
 */

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
} from '@spark-appworks/spark-json-document'

export type {
  BooleanSchemaOptions,
  EnumSchemaOptions,
  NumberSchemaOptions,
  ObjectSchemaOptions,
  StringSchemaOptions,
} from '@spark-appworks/spark-json-document'
