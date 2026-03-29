export type FieldOptionValue = string | number | boolean

export interface FieldOption {
  label: string
  value: FieldOptionValue
  disabled?: boolean
  children?: FieldOption[]
}

export function normalizeOption(
  raw: unknown,
  labelField: string,
  valueField: string,
  childrenField: string,
): FieldOption | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    return { label: String(raw), value: raw }
  }
  if (typeof raw !== 'object') return null

  const record = raw as Record<string, unknown>
  const label = record[labelField] ?? record['label'] ?? record['text'] ?? record['name'] ?? record[valueField] ?? record['value']
  const value = record[valueField] ?? record['value'] ?? record['id'] ?? record['code'] ?? label
  if (label === undefined || value === undefined) return null

  const rawChildren = record[childrenField] ?? record['children'] ?? record['items'] ?? record['nodes']
  const children = Array.isArray(rawChildren)
    ? rawChildren
      .map(item => normalizeOption(item, labelField, valueField, childrenField))
      .filter((item): item is FieldOption => item !== null)
    : []

  const option: FieldOption = {
    label: String(label),
    value: value as FieldOptionValue,
    disabled: record['disabled'] === true,
  }

  if (children.length > 0) {
    option.children = children
  }

  return option
}

export function normalizeMultiValue(value: unknown): FieldOptionValue[] {
  if (Array.isArray(value)) return value as FieldOptionValue[]
  if (typeof value === 'string') {
    if (!value.trim()) return []
    return value.split(',').map(item => item.trim())
  }
  if (value === null || value === undefined || value === '') return []
  return [value as FieldOptionValue]
}

export function flattenOptions(source: FieldOption[]): FieldOption[] {
  const result: FieldOption[] = []
  for (const option of source) {
    result.push(option)
    if (option.children && option.children.length > 0) {
      result.push(...flattenOptions(option.children))
    }
  }
  return result
}