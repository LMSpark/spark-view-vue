/**
 * ═══════════════════════════════════════════════════════════════
 * schema/index.ts — SPARK AI schema 公共入口
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】最底层，被 module-semantic 和 host 共同依赖。
 *   这是 LLM 参数 / JSON Schema / 参数校验的单一事实源。
 *
 * 【导出策略】类型和值分列导出，便于消费方按需导入 type-only。
 * ═══════════════════════════════════════════════════════════════
 */

// ── 类型：JSON Schema 核心类型（SSOT）─────────────────────────
export type {
  LlmJsonObject,
  LlmJsonSchema,
  LlmJsonSchemaObject,
  LlmJsonSchemaType,
  LlmJsonValue,
} from './schema-core-api'

// ── 值：Schema 便捷构造器 ─────────────────────────────────────
export {
  anySchema,
  arraySchema,
  booleanSchema,
  enumSchema,
  numberSchema,
  objectSchema,
  stringSchema,
} from './schema-builders-api'

// ── 值 + 类型：参数校验器 ─────────────────────────────────────
export {
  LlmSchemaValidator,
  noParamsSchema,
  paramsSchema,
} from './schema-params-api'

export type {
  LlmParamValidationIssue,
  LlmParamValidationResult,
} from './schema-params-api'
