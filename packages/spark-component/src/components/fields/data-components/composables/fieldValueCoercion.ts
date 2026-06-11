/**
 * @module @spark-appworks/spark-component:components/fields/data-components/composables/fieldValueCoercion
 * @spark-appworks/spark-component:components/fields/data-components/composables/fieldValueCoercion 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
// 这里不再为 JS 基础类型保留导出别名，字段值归一化结果直接使用原生联合类型。

export function coerceStringValue(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '')
}

export function coerceNumberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value === null || value === undefined || value === '') return 0
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : 0
}

export function coerceBooleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value === 'true' || value === '1'
  return false
}

export function coerceNullableBooleanValue(value: unknown): boolean | null {
  if (value === null || value === undefined || value === '') return null
  return coerceBooleanValue(value)
}

export function coercePrimitiveOptionValue(value: unknown): string | number {
  return typeof value === 'string' || typeof value === 'number' ? value : ''
}

export function coercePrimitiveOptionArray(value: unknown): Array<string | number | boolean> {
  if (!Array.isArray(value)) return []
  return value.filter(isPrimitiveOptionValue)
}

export function coerceStringNumberArray(value: unknown): Array<string | number> {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string | number => typeof item === 'string' || typeof item === 'number')
}

export function coerceTreeSelectValue(value: unknown): string | number | boolean | Array<string | number | boolean> {
  if (isPrimitiveOptionValue(value)) return value
  return coercePrimitiveOptionArray(value)
}

export function coerceCascaderValue(value: unknown): Array<string | number | boolean> | Array<Array<string | number | boolean>> {
  if (!Array.isArray(value)) return []
  if (value.every(isPrimitiveOptionValue)) return value
  return value.filter(isPrimitiveOptionPath)
}

export function coerceDateFieldValue(value: unknown): string | Date | Array<string | Date> {
  if (typeof value === 'string' || value instanceof Date) return value
  if (Array.isArray(value)) return value.filter((item): item is string | Date => typeof item === 'string' || item instanceof Date)
  return ''
}

export function coerceStringOrDateValue(value: unknown): string | Date {
  if (typeof value === 'string' || value instanceof Date) return value
  return String(value ?? '')
}

export function coerceNumberRangeValue(value: unknown): number | [number | undefined, number | undefined] {
  if (Array.isArray(value)) {
    const start = coerceOptionalNumberValue(value[0])
    const end = coerceOptionalNumberValue(value[1])
    return [start, end]
  }
  return coerceNumberValue(value)
}

function coerceOptionalNumberValue(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : undefined
}

function isPrimitiveOptionValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function isPrimitiveOptionPath(value: unknown): value is Array<string | number | boolean> {
  return Array.isArray(value) && value.every(isPrimitiveOptionValue)
}
