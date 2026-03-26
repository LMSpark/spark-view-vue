import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { getViewFromRawKey } from '@spark-view/spark-data'
import { PAGE_DATASET } from '../../capabilities.js'
import { useSparkConsume } from '../internal'
import { useFieldPermission } from './useFieldPermission'
import type { FieldPermissionProps } from './useFieldPermission'

type FieldOptionValue = string | number | boolean

export interface FieldOption {
  label: string
  value: FieldOptionValue
  disabled?: boolean
  children?: FieldOption[]
}

interface FieldTransferOption {
  key: string | number
  label: string
  disabled?: boolean
}

interface FieldOptionProps {
  options?: unknown[] | undefined
  optionLabelField?: string | undefined
  optionValueField?: string | undefined
  optionChildrenField?: string | undefined
  /** 选项数据源 DataKey（如 'Categories@rows'），从 DataView 动态获取选项 */
  optionKey?: string | undefined
}

interface UseFieldOptionsReturn {
  options: ComputedRef<FieldOption[]>
  flatOptions: ComputedRef<FieldOption[]>
  findOptionLabel: (value: unknown) => string
  formatOptionValue: (value: unknown) => string
  formatCascaderValue: (value: unknown) => string
  transferData: ComputedRef<FieldTransferOption[]>
}

interface UseOptionFieldOptions<TValue> {
  props: FieldOptionProps & FieldPermissionProps<TValue>
  type: string
  fallbackValue: TValue
  formatDisplay?: (value: unknown, helpers: UseFieldOptionsReturn) => string
}

function normalizeOption(
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

function normalizeMultiValue(value: unknown): FieldOptionValue[] {
  if (Array.isArray(value)) return value as FieldOptionValue[]
  if (typeof value === 'string') {
    if (!value.trim()) return []
    return value.split(',').map(item => item.trim())
  }
  if (value === null || value === undefined || value === '') return []
  return [value as FieldOptionValue]
}

function flattenOptions(source: FieldOption[]): FieldOption[] {
  const result: FieldOption[] = []
  for (const option of source) {
    result.push(option)
    if (option.children && option.children.length > 0) {
      result.push(...flattenOptions(option.children))
    }
  }
  return result
}

export function useFieldOptions(props: FieldOptionProps): UseFieldOptionsReturn {
  const optionLabelField = computed(() => props.optionLabelField ?? 'label')
  const optionValueField = computed(() => props.optionValueField ?? 'value')
  const optionChildrenField = computed(() => props.optionChildrenField ?? 'children')

  // ── optionKey → DataView 动态选项解析 ──
  const resolvedOptionKey = computed(() => props.optionKey)
  const { sparkConsume } = useSparkConsume()
  const pageDataSet = sparkConsume(PAGE_DATASET)

  const optionKeyView = computed(() => {
    const key = resolvedOptionKey.value
    if (!key || !pageDataSet) return null
    return getViewFromRawKey(key, pageDataSet) ?? null
  })

  const options = computed<FieldOption[]>(() => {
    // 优先级 1: optionKey → DataView.rows（动态选项）
    const view = optionKeyView.value
    if (view) {
      return view.rows
        .map(row => normalizeOption(row, optionLabelField.value, optionValueField.value, optionChildrenField.value))
        .filter((item): item is FieldOption => item !== null)
    }
    // 优先级 2: 静态 options（props）
    const source = props.options ?? []
    if (!Array.isArray(source)) return []
    return source
      .map(item => normalizeOption(item, optionLabelField.value, optionValueField.value, optionChildrenField.value))
      .filter((item): item is FieldOption => item !== null)
  })

  const flatOptions = computed(() => flattenOptions(options.value))

  function findOptionLabel(value: unknown): string {
    const match = flatOptions.value.find(option => String(option.value) === String(value))
    return match?.label ?? String(value ?? '')
  }

  function formatOptionValue(value: unknown): string {
    const values = normalizeMultiValue(value)
    if (values.length === 0) return ''
    return values.map(findOptionLabel).join(' / ')
  }

  function formatCascaderValue(value: unknown): string {
    if (!Array.isArray(value) || value.length === 0) return ''

    if (value.every(item => Array.isArray(item))) {
      return (value as unknown[])
        .map(item => formatCascaderValue(item))
        .filter(Boolean)
        .join(' ; ')
    }

    return (value as unknown[])
      .map(item => findOptionLabel(item))
      .filter(Boolean)
      .join(' / ')
  }

  function toTransferData(): FieldTransferOption[] {
    return flatOptions.value.map(option => {
      const transferOption: FieldTransferOption = {
        key: typeof option.value === 'boolean' ? String(option.value) : option.value,
        label: option.label,
      }
      if (option.disabled === true) {
        transferOption.disabled = true
      }
      return transferOption
    })
  }

  const transferData = computed(() => toTransferData())

  return {
    options,
    flatOptions,
    findOptionLabel,
    formatOptionValue,
    formatCascaderValue,
    transferData,
  }
}

export function useOptionField<TValue>(options: UseOptionFieldOptions<TValue>) {
  const optionHelpers = useFieldOptions(options.props)
  const permissionHelpers = useFieldPermission<TValue>({
    props: options.props,
    type: options.type,
    fallbackValue: options.fallbackValue,
    formatDisplay: (value: unknown) => options.formatDisplay
      ? options.formatDisplay(value, optionHelpers)
      : optionHelpers.formatOptionValue(value),
  })

  return {
    ...optionHelpers,
    ...permissionHelpers,
  }
}