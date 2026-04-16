import { computed } from 'vue'
import type { PageSelectableValue } from '../../../internal'
import type { FieldOption } from '../../options/index.js'
import type {
  SparkFieldProps,
  SparkOptionFieldProps,
  SparkOptionValueMode,
  SparkPrimaryActionTextProps,
  SparkReadonlyActionTextProps,
  ValueRef,
} from '../../../shared-types.js'

type EntityPickerValue = PageSelectableValue | PageSelectableValue[] | string

interface UseEntityPickerStateOptions {
  buttonText: ValueRef<NonNullable<SparkPrimaryActionTextProps['buttonText']>>
  readonlyButtonText: ValueRef<NonNullable<SparkReadonlyActionTextProps['readonlyButtonText']>>
  clearable: ValueRef<NonNullable<SparkFieldProps['clearable']>>
  multiple: ValueRef<NonNullable<SparkOptionFieldProps['multiple']>>
  searchable: ValueRef<boolean>
  valueSeparator: ValueRef<NonNullable<SparkOptionFieldProps['valueSeparator']>>
  valueMode: ValueRef<SparkOptionValueMode>
  entityName: ValueRef<string>
  placeholder: ValueRef<NonNullable<SparkFieldProps['placeholder']>>
  flatOptions: ValueRef<FieldOption[]>
  currentRawValue: ValueRef<EntityPickerValue>
  currentRawStringValue: ValueRef<string>
  isCurrentFieldEditable: ValueRef<boolean>
  hasSelectorCapability: ValueRef<boolean>
  primaryAction: ValueRef<'select' | 'view'>
  selectEntities: (options: {
    title: string
    entityName: string
    placeholder: string
    multiple: boolean
    searchable: boolean
    currentValue: EntityPickerValue
    options: Array<{ label: string; value: PageSelectableValue; disabled?: boolean }>
  }) => Promise<Array<{ label: string; value: PageSelectableValue }>>
  updateValue: (value: EntityPickerValue) => void | Promise<void>
}

export function useEntityPickerState(options: UseEntityPickerStateOptions) {
  const primaryActionText = computed(() => (options.primaryAction.value === 'select' ? options.buttonText.value : options.readonlyButtonText.value))
  const hasValue = computed(() => Array.isArray(options.currentRawValue.value)
    ? options.currentRawValue.value.length > 0
    : options.currentRawStringValue.value.trim().length > 0)
  const showClearButton = computed(() => options.clearable.value && options.isCurrentFieldEditable.value && hasValue.value)

  function buildNextValue(values: PageSelectableValue[]): EntityPickerValue {
    if (options.multiple.value) {
      if (options.valueMode.value === 'array') return values
      if (options.valueMode.value === 'auto' && Array.isArray(options.currentRawValue.value)) return values
      return values.map(value => String(value)).join(options.valueSeparator.value)
    }
    return values[0] ?? ''
  }

  async function openSelector(): Promise<void> {
    const selected = await options.selectEntities({
      title: `${primaryActionText.value}${options.entityName.value}`,
      entityName: options.entityName.value,
      placeholder: options.placeholder.value,
      multiple: options.multiple.value,
      searchable: options.searchable.value,
      currentValue: options.currentRawValue.value,
      options: options.flatOptions.value.map(option => ({
        label: option.label,
        value: option.value,
        ...(option.disabled === true ? { disabled: true } : {}),
      })),
    })

    if (!options.isCurrentFieldEditable.value) return
    await options.updateValue(buildNextValue(selected.map(item => item.value)))
  }

  function clearValue(): void {
    void options.updateValue(options.multiple.value && (
      options.valueMode.value === 'array'
      || (options.valueMode.value === 'auto' && Array.isArray(options.currentRawValue.value))
    ) ? [] : '')
  }

  return {
    primaryActionText,
    hasValue,
    showClearButton,
    openSelector,
    clearValue,
  }
}