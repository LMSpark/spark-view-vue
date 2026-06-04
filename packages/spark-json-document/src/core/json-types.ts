/**
 * ═══════════════════════════════════════════════════════════════
 * core/json-types.ts — JSON 基础值类型（单一事实源 SSOT）
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】最底层基础类型，被 schema/ 和 tree/ 两层共同依赖。
 *   本文件不依赖包内任何其他模块。
 *
 * 【设计决策】
 *   - 统一 JSON 值类型定义，消除 spark-ai 的 AiJsonValue/AiJsonObject 重复定义。
 *   - 旧 AiJsonValue/AiJsonObject/AiJsonParams 名称在 spark-ai/json 中保留为 deprecated alias。
 * ═══════════════════════════════════════════════════════════════
 */

import { isRecord } from '@spark-appworks/spark-utils'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · JSON 值类型
// ═══════════════════════════════════════════════════════════════

/** JSON 原始值 */
type JsonPrimitive = string | number | boolean | null

/** 递归 JSON 值：原始值 | 对象 | 数组 */
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]

/** JSON 对象：key → JsonValue 映射 */
export type JsonObject = {
  [key: string]: JsonValue
}

/** 文档顶层：对象或数组 */
export type JsonDocument = JsonObject | JsonValue[]

/** 函数/业务参数对象：运行时宽形态，key → JsonValue */
export type JsonParams = Readonly<Record<string, JsonValue>>

/**
 * 参数对象的具名字段形态。
 *
 * 与 JsonParams 不同，本类型不引入 string 索引签名，避免 keyof 退化为 string。
 * 具体业务输入应使用它，以保留字段级约束。
 */
export type JsonParamShape<TShape extends object> = Readonly<TShape>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 运行时守卫与收窄
// ═══════════════════════════════════════════════════════════════

export { isRecord }

/** 判断值是否为 JsonObject */
export function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value)
}

/** 将未知值安全收窄为 JsonValue；不符合时返回 null */
export function asJsonValue(value: unknown): JsonValue | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) {
    const items: JsonValue[] = []
    for (const item of value) {
      const narrowed = asJsonValue(item)
      if (narrowed === null && item !== null) return null
      items.push(narrowed ?? null)
    }
    return items
  }
  if (isRecord(value)) {
    const obj: JsonObject = {}
    for (const [k, v] of Object.entries(value)) {
      const narrowed = asJsonValue(v)
      if (narrowed === null && v !== null) return null
      obj[k] = narrowed ?? null
    }
    return obj
  }
  return null
}

/** 已知非容器值收窄为原始类型 */
export function toPrimitive(value: JsonValue): JsonPrimitive {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return null
}
