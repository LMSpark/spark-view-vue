/**
 * core/index.ts — JSON 基础类型与工具公共入口
 */

// ── 类型 ──
export type {
  JsonDocument,
  JsonObject,
  JsonParamShape,
  JsonParams,
  JsonValue,
} from './json-types'

// ── 值 + 类型：运行时守卫 ──
export {
  asJsonValue,
  isJsonObject,
  isRecord,
  toPrimitive,
} from './json-types'

// ── 类型：路径 ──
export type { JsonPath } from './json-path'

// ── 值：路径操作 ──
export {
  formatJsonPath,
  getValueAtJsonPath,
} from './json-path'

// ── 值：JSON 值规整 ──
export {
  coerceJsonValue,
  coerceStrictJsonValue,
} from './coercion'

// ── 值：解析与序列化 ──
export {
  normalizeJsonDocument,
  parseJsonDocument,
  serializeJsonDocument,
} from './parse'
