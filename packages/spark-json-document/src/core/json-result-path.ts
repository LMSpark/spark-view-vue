/**
 * resultPath / JSON 取值 — 运行时委托 jmespath，不自研路径引擎。
 */

import jmespath from 'jmespath'

const SIMPLE_KEY_PATTERN = /^[A-Za-z_$][\w$]*$/u

/** ClassModel resultPath（属性名段）→ jmespath 表达式；空路径表示 result 根本身。 */
export function resultPathToJmespath(segments: readonly string[]): string | null {
  if (segments.length === 0) return null
  return segments
    .map(segment => (SIMPLE_KEY_PATTERN.test(segment) ? segment : `"${segment.replace(/"/gu, '\\"')}"`))
    .join('.')
}

/** 按 resultPath 从 JSON 值读取子节点；路径为空时返回原值。 */
export function readJsonValueAtResultPath(value: unknown, segments: readonly string[]): unknown {
  const expression = resultPathToJmespath(segments)
  if (expression === null) return value
  return jmespath.search(value, expression)
}

/** 单段属性读取（script proxy 逐步下钻）。 */
export function readJsonProperty(value: unknown, property: string): unknown {
  if (value === null || typeof value !== 'object') return undefined
  return readJsonValueAtResultPath(value, [property])
}
