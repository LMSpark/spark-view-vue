import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { PAGE_DATASET, useSparkConsume } from '../../internal'
import { resolveViewFromDataKey } from '../../../shared/data-key-resolver.js'
import { useFieldPermission } from '../context/useFieldPermission'
import type { FieldPermissionProps } from '../context/useFieldPermission'
import { buildOptionSourceFromView } from './option-source.js'
import {
  flattenOptions,
  normalizeMultiValue,
  normalizeOption,
  type FieldOption,
} from './option-normalization.js'

export type { FieldOption } from './option-normalization.js'

export interface FieldTransferOption {
  key: string | number
  label: string
  disabled?: boolean
}

interface FieldOptionProps {
  options?: unknown[] | undefined
  optionLabelField?: string | undefined
  optionValueField?: string | undefined
  optionChildrenField?: string | undefined
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

export function useFieldOptions(props: FieldOptionProps): UseFieldOptionsReturn {
  const resolvedOptionKey = computed(() => props.optionKey)
  const { sparkConsume } = useSparkConsume()
  const pageDataSet = sparkConsume(PAGE_DATASET)

  const optionKeyView = computed(() => {
    const key = resolvedOptionKey.value
    return resolveViewFromDataKey(key, pageDataSet)
  })

  const optionLabelField = computed(() =>
    props.optionLabelField
    ?? optionKeyView.value?.treeConfig?.textField
    ?? 'label'
  )
  const optionValueField = computed(() =>
    props.optionValueField
    ?? optionKeyView.value?.primaryKey
    ?? optionKeyView.value?.treeConfig?.idField
    ?? 'value'
  )
  const optionChildrenField = computed(() => props.optionChildrenField ?? 'children')

  const options = computed<FieldOption[]>(() => {
    const view = optionKeyView.value
    if (view) {
      return buildOptionSourceFromView(
        view,
        optionLabelField.value,
        optionChildrenField.value,
      )
        .map(row => normalizeOption(row, optionLabelField.value, optionValueField.value, optionChildrenField.value))
        .filter((item): item is FieldOption => item !== null)
    }
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