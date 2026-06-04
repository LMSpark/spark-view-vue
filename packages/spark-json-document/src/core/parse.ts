/**
 * ═══════════════════════════════════════════════════════════════
 * core/parse.ts — JSON 文档解析与序列化
 * ═══════════════════════════════════════════════════════════════
 */

import type { JsonDocument } from './json-types'
import { asJsonValue, isJsonObject } from './json-types'

/** 解析 JSON 字符串为 JsonDocument */
export function parseJsonDocument(rawText: string): JsonDocument {
  const parsed: unknown = JSON.parse(rawText)
  return normalizeJsonDocument(parsed)
}

/** 将 JsonDocument 序列化为格式化 JSON 字符串 */
export function serializeJsonDocument(value: JsonDocument): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/**
 * 归一化任意值为 JsonDocument（顶层仅允许对象或数组）。
 */
export function normalizeJsonDocument(value: unknown): JsonDocument {
  const narrowed = asJsonValue(value)
  if (narrowed === null) throw new Error('JSON 顶层必须是对象或数组')
  if (Array.isArray(narrowed) || isJsonObject(narrowed)) return narrowed
  throw new Error('JSON 顶层必须是对象或数组')
}
