import {
  errorCheck,
  infoCheck,
  ok,
  type CheckEntry,
  type OperationResult,
} from '@spark-view/spark-ai/module-semantic'
import type { LlmJsonValue } from '@spark-view/spark-ai/schema'

export type ModuleSemanticServiceResult =
  | {
    readonly ok: true
    readonly data: unknown
    readonly summary: string
  }
  | {
    readonly ok: false
    readonly code: string
    readonly msg: string
    readonly fix: string
  }

export function serviceResultToOperationResult(
  result: ModuleSemanticServiceResult,
): OperationResult<LlmJsonValue> {
  if (result.ok) {
    return okJson(result.data, [infoCheck('OK', result.summary)])
  }
  return {
    ok: false,
    checks: [errorCheck(result.code, result.msg, result.fix)],
  }
}

function okJson(data: unknown, checks: readonly CheckEntry[]): OperationResult<LlmJsonValue> {
  const json = coerceLlmJsonValue(data)
  return ok(json, checks)
}

function coerceLlmJsonValue(value: unknown): LlmJsonValue | undefined {
  if (value === null) return null
  if (value === undefined) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    const out: LlmJsonValue[] = []
    for (const item of value) {
      const coerced = coerceLlmJsonValue(item)
      if (coerced !== undefined) out.push(coerced)
    }
    return out
  }
  if (value instanceof Set) {
    const out: LlmJsonValue[] = []
    for (const item of value.values()) {
      const coerced = coerceLlmJsonValue(item)
      if (coerced !== undefined) out.push(coerced)
    }
    return out
  }
  if (value instanceof Map) {
    const out: Record<string, LlmJsonValue> = {}
    for (const [key, item] of value.entries()) {
      const coerced = coerceLlmJsonValue(item)
      if (coerced !== undefined) out[String(key)] = coerced
    }
    return out
  }
  if (typeof value === 'object') {
    const out: Record<string, LlmJsonValue> = {}
    for (const [key, raw] of Object.entries(value)) {
      const coerced = coerceLlmJsonValue(raw)
      if (coerced !== undefined) out[key] = coerced
    }
    return out
  }
  return undefined
}
