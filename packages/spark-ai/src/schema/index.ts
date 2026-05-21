/**
 * @packageDocumentation
 *
 * SPARK AI schema 公共入口。
 *
 * 这里是 LLM 参数 / JSON Schema / 参数校验的单一事实源。module-semantic、
 * host 和业务注册都只依赖这一层,不再从旧 runtime protocol 取类型。
 */

export type {
  LlmJsonObject,
  LlmJsonSchema,
  LlmJsonSchemaObject,
  LlmJsonSchemaType,
  LlmJsonValue,
  LlmParameterSchemaRoot,
} from './types'

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
  JsonSchemaProperties,
} from './helpers'

export {
  LlmSchemaValidator,
} from './validator'

export type {
  LlmParamValidationIssue,
  LlmParamValidationResult,
} from './validator'
