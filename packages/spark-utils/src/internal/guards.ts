/**
 * SPARK 类型守卫（基础层）。
 *
 * 所有包的类型守卫 SSoT，按使用频率分为两级：
 * - 根出口（@spark-view/spark-utils）：isRecord、isObject、isCallable
 * - /internal 出口：全部守卫，包括扩展的 read*Property 系列
 */

// ═══════════════════════════════════════════════════════════════
// 基础类型守卫
// ═══════════════════════════════════════════════════════════════

/** 判定值为 Record<string, unknown>（普通对象，排除数组和 null）。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 判定值为 object 类型（含数组，排除 null）。 */
export function isObject(value: unknown): value is object {
  return value !== null && typeof value === 'object'
}

/** 判定值为可调用函数。 */
export function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function'
}

// ═══════════════════════════════════════════════════════════════
// 属性读取（仅自有属性，不触碰原型链）
// ═══════════════════════════════════════════════════════════════

/** 读取自有属性值（不触碰原型链）。 */
export function readProperty(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined
  return Object.getOwnPropertyDescriptor(value, key)?.value
}

/** 读取 string 类型自有属性。 */
export function readStringProperty(value: unknown, key: string): string | undefined {
  const property = readProperty(value, key)
  return typeof property === 'string' ? property : undefined
}

/** 读取非空 string 类型自有属性；只校验 trim 后非空，返回原始字符串。 */
export function readNonEmptyStringProperty(value: unknown, key: string): string | undefined {
  const property = readStringProperty(value, key)
  return property !== undefined && property.trim() !== '' ? property : undefined
}

/** 读取 number 类型自有属性。 */
export function readNumberProperty(value: unknown, key: string): number | undefined {
  const property = readProperty(value, key)
  return typeof property === 'number' ? property : undefined
}

/** 读取 boolean 类型自有属性。 */
export function readBooleanProperty(value: unknown, key: string): boolean | undefined {
  const property = readProperty(value, key)
  return typeof property === 'boolean' ? property : undefined
}

/** 判定值为 string[]。 */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/** 读取 string[] 类型自有属性。 */
export function readStringArrayProperty(value: unknown, key: string): string[] | undefined {
  const property = readProperty(value, key)
  return isStringArray(property) ? property : undefined
}
