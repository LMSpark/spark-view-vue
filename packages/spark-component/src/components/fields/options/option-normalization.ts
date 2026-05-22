// 这里不再为 JS 基础类型保留导出别名，选项值直接使用原生联合类型。

export type FieldOption = {
  label: string
  value: string | number | boolean
  disabled?: boolean
  children?: FieldOption[]}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isFieldOptionValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

export function normalizeOption(
  raw: unknown,
  labelField: string,
  valueField: string,
  childrenField: string,
  disabledField: string,
): FieldOption | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    return { label: String(raw), value: raw }
  }
  if (!isRecord(raw)) return null

  const label = raw[labelField] ?? raw['label'] ?? raw['text'] ?? raw['name'] ?? raw[valueField] ?? raw['value']
  const value = raw[valueField] ?? raw['value'] ?? raw['id'] ?? raw['code'] ?? label
  if (label === undefined || !isFieldOptionValue(value)) return null

  const rawChildren = raw[childrenField] ?? raw['children'] ?? raw['items'] ?? raw['nodes']
  const children = Array.isArray(rawChildren)
    ? rawChildren
      .map(item => normalizeOption(item, labelField, valueField, childrenField, disabledField))
      .filter((item): item is FieldOption => item !== null)
    : []

  const rawDisabled = raw[disabledField] ?? raw['disabled']

  const option: FieldOption = {
    label: String(label),
    value,
    disabled: rawDisabled === true,
  }

  if (children.length > 0) {
    option.children = children
  }

  return option
}

export function normalizeMultiValue(value: unknown, separator = ','): Array<string | number | boolean> {
  if (Array.isArray(value)) return value.filter(isFieldOptionValue)
  if (typeof value === 'string') {
    if (!value.trim()) return []
    if (separator === '') return [value]
    return value.split(separator).map(item => item.trim())
  }
  if (value === null || value === undefined || value === '') return []
  return isFieldOptionValue(value) ? [value] : []
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
