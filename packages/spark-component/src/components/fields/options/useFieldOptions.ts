import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { SparkOptionFieldProps } from '../../shared-types.js'
import { PAGE_DATASET, useSparkConsume } from '../../internal'
import { DataMember, resolveDataViewKey, resolveDataViewMember } from '@spark-view/spark-data'
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

export type FieldTransferOption = {
  key: string | number
  label: string
  disabled?: boolean}

type OptionalWithUndefined<T> = {
  [K in keyof T]?: T[K] | undefined
}

type FieldOptionProps = OptionalWithUndefined<Pick<
  SparkOptionFieldProps,
  'options'
  | 'optionLabelField'
  | 'optionValueField'
  | 'optionDisabledField'
  | 'optionChildrenField'
  | 'optionDataViewKey'
  | 'optionDataMember'
  | 'optionDataField'
  | 'valueSeparator'
>>

type UseFieldOptionsReturn = {
  options: ComputedRef<FieldOption[]>
  flatOptions: ComputedRef<FieldOption[]>
  normalizeOptionValues: (value: unknown) => Array<string | number | boolean>
  findOptionLabel: (value: unknown) => string
  findOptionLabels: (value: unknown) => string[]
  formatOptionValue: (value: unknown) => string
  formatCascaderValue: (value: unknown) => string
  transferData: ComputedRef<FieldTransferOption[]>}

type UseOptionFieldOptions<TValue> = {
  props: FieldOptionProps & FieldPermissionProps<TValue>
  type: string
  fallbackValue: TValue
  coerce: (rawValue: unknown) => TValue
  formatDisplay?: (value: unknown, helpers: UseFieldOptionsReturn) => string}

export function useFieldOptions(props: FieldOptionProps): UseFieldOptionsReturn {
  const resolvedOptionDataViewKey = computed(() => props.optionDataViewKey)
  const resolvedOptionDataMember = computed(() => props.optionDataMember ?? DataMember.Rows)
  const { sparkConsume } = useSparkConsume()
  const pageDataSet = sparkConsume(PAGE_DATASET)

  const optionDataView = computed(() => {
    const key = resolvedOptionDataViewKey.value
    return resolveDataViewKey(key, pageDataSet)
  })

  const optionLabelField = computed(() =>
    props.optionLabelField
    ?? optionDataView.value?.labelField
    ?? optionDataView.value?.treeConfig?.textField
    ?? 'label'
  )
  const optionValueField = computed(() =>
    props.optionValueField
    ?? (typeof optionDataView.value?.valueField === 'string' ? optionDataView.value.valueField : undefined)
    ?? optionDataView.value?.primaryKey
    ?? optionDataView.value?.treeConfig?.idField
    ?? 'value'
  )
  const optionDisabledField = computed(() => props.optionDisabledField ?? 'disabled')
  const optionChildrenField = computed(() => props.optionChildrenField ?? 'children')
  const valueSeparator = computed(() => props.valueSeparator ?? optionDataView.value?.selectionDelimiter ?? ',')

  const options = computed<FieldOption[]>(() => {
    const view = optionDataView.value
    if (view) {
      const source = resolvedOptionDataMember.value === DataMember.Rows
        ? buildOptionSourceFromView(
            view,
            optionLabelField.value,
            optionChildrenField.value,
          )
        : resolveDataViewMember({
            dataViewKey: resolvedOptionDataViewKey.value,
            dataMember: resolvedOptionDataMember.value,
            dataField: props.optionDataField,
          }, pageDataSet)

      const rows = Array.isArray(source) ? source : []
      return rows
        .map(row => normalizeOption(row, optionLabelField.value, optionValueField.value, optionChildrenField.value, optionDisabledField.value))
        .filter((item): item is FieldOption => item !== null)
    }
    const source = props.options ?? []
    if (!Array.isArray(source)) return []
    return source
      .map(item => normalizeOption(item, optionLabelField.value, optionValueField.value, optionChildrenField.value, optionDisabledField.value))
      .filter((item): item is FieldOption => item !== null)
  })

  const flatOptions = computed(() => flattenOptions(options.value))

  function findOptionLabel(value: unknown): string {
    const match = flatOptions.value.find(option => String(option.value) === String(value))
    return match?.label ?? String(value ?? '')
  }

  function normalizeOptionValues(value: unknown): Array<string | number | boolean> {
    return normalizeMultiValue(value, valueSeparator.value)
  }

  function findOptionLabels(value: unknown): string[] {
    return normalizeOptionValues(value).map(findOptionLabel)
  }

  function formatOptionValue(value: unknown): string {
    const values = normalizeOptionValues(value)
    if (values.length === 0) return ''
    return values.map(findOptionLabel).join(' / ')
  }

  function formatCascaderValue(value: unknown): string {
    if (!Array.isArray(value) || value.length === 0) return ''

    if (value.every(item => Array.isArray(item))) {
      return value
        .map((item) => formatCascaderValue(item))
        .filter(Boolean)
        .join(' ; ')
    }

    return value
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
    normalizeOptionValues,
    findOptionLabel,
    findOptionLabels,
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
    coerce: options.coerce,
    formatDisplay: (value: unknown) => options.formatDisplay
      ? options.formatDisplay(value, optionHelpers)
      : optionHelpers.formatOptionValue(value),
  })

  return {
    ...optionHelpers,
    ...permissionHelpers,
  }
}
