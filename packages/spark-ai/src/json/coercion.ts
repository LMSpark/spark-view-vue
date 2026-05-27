/**
 * json/coercion.ts — 将任意运行时值规整为 JSON 安全值。
 *
 * 两个公开函数：
 * - coerceJsonValue(value) — 尽力转换（lossy）：跳过 NaN/undefined/循环引用，
 *   Symbol/BigInt/Date/URL 转字符串，TypedArray 转 number[]。
 * - coerceStrictJsonValue(value) — 严格转换：遇到 NaN/Infinity/BigInt/Symbol/
 *   循环引用/无效 Date 时返回 undefined，不静默转换非 JSON 安全值。
 */

import type { AiJsonValue } from './types'

const STRICT_REJECT = Symbol('strict-reject')

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

// ── 公开入口 ──────────────────────────────────────────────────

export function coerceJsonValue(value: unknown): AiJsonValue | undefined {
  return coerceInternal(value, new WeakSet<object>())
}

export function coerceStrictJsonValue(value: unknown): AiJsonValue | undefined {
  const result = coerceStrict(value, new WeakSet<object>())
  return result === STRICT_REJECT ? undefined : result
}

// ── 内部递归实现 ──────────────────────────────────────────────

function coerceInternal(value: unknown, seen: WeakSet<object>): AiJsonValue | undefined {
  if (value === null) return null
  if (value === undefined) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'symbol') return value.toString()

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : undefined
  }
  if (value instanceof URL) {
    return value.toString()
  }

  if (value instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(value))
  }
  if (ArrayBuffer.isView(value)) {
    return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
  }

  if (isUnknownArray(value) || value instanceof Set) {
    return withCycleGuard(value, seen, () => coerceIterable(value, seen))
  }

  if (value instanceof Map) {
    return withCycleGuard(value, seen, () => coerceRecord(value.entries(), seen))
  }

  if (typeof value === 'object') {
    return withCycleGuard(value, seen, () => coerceRecord(Object.entries(value), seen))
  }

  return undefined
}

function coerceStrict(value: unknown, seen: WeakSet<object>): AiJsonValue | typeof STRICT_REJECT | undefined {
  if (value === null) return null
  if (value === undefined) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : STRICT_REJECT
  if (typeof value === 'boolean') return value
  if (typeof value === 'bigint') return STRICT_REJECT
  if (typeof value === 'symbol') return STRICT_REJECT

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : STRICT_REJECT
  }
  if (value instanceof URL) {
    return value.toString()
  }

  if (value instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(value))
  }
  if (ArrayBuffer.isView(value)) {
    return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
  }

  if (isUnknownArray(value) || value instanceof Set) {
    return withCycleGuardStrict(value, seen, () => coerceIterableStrict(value, seen))
  }

  if (value instanceof Map) {
    return withCycleGuardStrict(value, seen, () => coerceRecordStrict(value.entries(), seen))
  }

  if (typeof value === 'object') {
    return withCycleGuardStrict(value, seen, () => coerceRecordStrict(Object.entries(value), seen))
  }

  return STRICT_REJECT
}

// ── 循环引用保护 ──────────────────────────────────────────────

function withCycleGuard<TValue extends AiJsonValue>(
  value: object,
  seen: WeakSet<object>,
  createValue: () => TValue,
): TValue | undefined {
  if (seen.has(value)) return undefined
  seen.add(value)
  try {
    return createValue()
  } finally {
    seen.delete(value)
  }
}

function withCycleGuardStrict<TValue extends AiJsonValue>(
  value: object,
  seen: WeakSet<object>,
  createValue: () => TValue | typeof STRICT_REJECT,
): TValue | typeof STRICT_REJECT {
  if (seen.has(value)) return STRICT_REJECT
  seen.add(value)
  try {
    return createValue()
  } finally {
    seen.delete(value)
  }
}

// ── 迭代器处理 ────────────────────────────────────────────────

function coerceIterable(items: Iterable<unknown>, seen: WeakSet<object>): AiJsonValue[] {
  const out: AiJsonValue[] = []
  for (const item of items) {
    const coerced = coerceInternal(item, seen)
    if (coerced !== undefined) out.push(coerced)
  }
  return out
}

function coerceIterableStrict(items: Iterable<unknown>, seen: WeakSet<object>): AiJsonValue[] | typeof STRICT_REJECT {
  const out: AiJsonValue[] = []
  for (const item of items) {
    const coerced = coerceStrict(item, seen)
    if (coerced === STRICT_REJECT) return STRICT_REJECT
    if (coerced !== undefined) out.push(coerced)
  }
  return out
}

function coerceRecord(
  entries: Iterable<readonly [unknown, unknown]>,
  seen: WeakSet<object>,
): Record<string, AiJsonValue> {
  const out: Record<string, AiJsonValue> = {}
  for (const [key, raw] of entries) {
    const coerced = coerceInternal(raw, seen)
    if (coerced !== undefined) out[String(key)] = coerced
  }
  return out
}

function coerceRecordStrict(
  entries: Iterable<readonly [unknown, unknown]>,
  seen: WeakSet<object>,
): Record<string, AiJsonValue> | typeof STRICT_REJECT {
  const out: Record<string, AiJsonValue> = {}
  for (const [key, raw] of entries) {
    const coerced = coerceStrict(raw, seen)
    if (coerced === STRICT_REJECT) return STRICT_REJECT
    if (coerced !== undefined) out[String(key)] = coerced
  }
  return out
}
