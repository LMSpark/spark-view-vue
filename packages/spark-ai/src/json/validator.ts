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
} from '@spark-appworks/spark-json-document'
