/**
 * schema/index.ts — JSON Schema 公共入口
 *
 * 【导出策略】类型和值分列导出，便于消费方按需导入 type-only。
 */

// ── 类型：JSON Schema 核心类型（SSOT）─────────────────────────
export type {
  JsonSchema,
  JsonSchemaObject,
  JsonSchemaType,
} from './schema-types'

// ── 值：Schema 便捷构造器 ─────────────────────────────────────
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
} from './schema-helpers'

export type {
  BooleanSchemaOptions,
  EnumSchemaOptions,
  NumberSchemaOptions,
  ObjectSchemaOptions,
  StringSchemaOptions,
} from './schema-helpers'

// ── 值 + 类型：参数校验器 ─────────────────────────────────────
export {
  JsonSchemaValidator,
} from './schema-validator'

export type {
  JsonValidationIssue,
  JsonValidationResult,
} from './schema-validator'

// ── 值 + 类型：Schema 路径解析 ────────────────────────────────
export {
  resolveSchemaInfoForPath,
} from './schema-resolution'

export type {
  JsonSchemaInfo,
} from './schema-resolution'

// ── 值：Schema 元数据注解 ─────────────────────────────────────
export {
  withMeta,
} from './with-meta'
