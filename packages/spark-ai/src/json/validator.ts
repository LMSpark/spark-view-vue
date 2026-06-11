/**
 * @module @spark-appworks/spark-ai:json/validator
 * 职责：提供 AI JSON 参数和 schema 处理中的 validator 能力，支撑输入校验、类型收敛和运行时保护。
 * 边界：只处理 JSON 值与 schema，不依赖 Vue、Host 或业务组件。
 * AI用途：当业务输入需要校验、规整或解释 JSON schema 时，用本模块确认基础 JSON 契约。
 */
/**
 * json/validator.ts — JSON Schema 参数校验器（deprecated re-export 层）
 *
 * 【迁移说明】校验器已统一到 @spark-appworks/spark-json-document。
 *   旧名称 → 新名称：
 *   AiJsonSchemaValidator  → JsonSchemaValidator
 *   AiJsonValidationIssue  → JsonValidationIssue
 *   AiJsonValidationResult → JsonValidationResult
 *   formatAiJsonValidationIssues → formatJsonValidationIssues
 */

export {
  JsonSchemaValidator as AiJsonSchemaValidator,
} from '@spark-appworks/spark-json-document'

export type {
  JsonValidationIssue as AiJsonValidationIssue,
  JsonValidationResult as AiJsonValidationResult,
  JsonSchemaValidateOptions as AiJsonSchemaValidateOptions,
} from '@spark-appworks/spark-json-document'
