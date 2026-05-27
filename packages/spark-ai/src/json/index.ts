/**
 * ═══════════════════════════════════════════════════════════════
 * json/index.ts — SPARK AI json 公共入口
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】最底层，被 modules 和 agent 共同依赖。
 *   这是 LLM 参数 / JSON Schema / 参数校验的单一事实源。
 *
 * 【导出策略】类型和值分列导出，便于消费方按需导入 type-only。
 * ═══════════════════════════════════════════════════════════════
 */

// ── 类型：JSON Schema 核心类型（SSOT）─────────────────────────
export type {
  AiJsonObject,
  AiJsonParamShape,
  AiJsonParams,
  AiJsonSchema,
  AiJsonSchemaObject,
  AiJsonSchemaType,
  AiJsonValue,
} from './types'

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
} from './helpers'

export type {
  BooleanSchemaOptions,
  EnumSchemaOptions,
  NumberSchemaOptions,
  ObjectSchemaOptions,
  StringSchemaOptions,
} from './helpers'

// ── 值 + 类型：参数校验器 ─────────────────────────────────────
export {
  AiJsonSchemaValidator,
} from './validator'

export type {
  AiJsonValidationIssue,
  AiJsonValidationResult,
} from './validator'

// ── 值：JSON 值规整 ──────────────────────────────────────────
export {
  coerceJsonValue,
  coerceStrictJsonValue,
} from './coercion'
