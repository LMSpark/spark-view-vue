import type { SparkOptionFieldProps } from '../../../shared-types.js'
import { useFieldControlState } from './useFieldControlState'
import { useOptionField } from '../../options/useFieldOptions'
import type { useFieldOptions } from '../../options/useFieldOptions'

type OptionalWithUndefined<T> = {
  [K in keyof T]?: T[K] | undefined
}

export type OptionFieldStateProps<TValue> = OptionalWithUndefined<Omit<SparkOptionFieldProps<TValue>, 'modelValue' | 'value' | 'options'>> & {
  modelValue?: TValue | undefined
  value?: TValue | undefined
  options?: unknown[] | undefined
}

interface UseOptionFieldStateOptions<TValue> {
  props: OptionFieldStateProps<TValue>
  fieldType: string
  fallbackValue: TValue
  emitUpdate: (value: TValue) => void
  coerce?: (rawValue: unknown) => TValue
  formatDisplay?: (value: unknown, helpers: ReturnType<typeof useFieldOptions>) => string
}

export function useOptionFieldState<TValue>(options: UseOptionFieldStateOptions<TValue>) {
  const optionResult = useOptionField<TValue>({
    props: options.props,
    type: options.fieldType,
    fallbackValue: options.fallbackValue,
    ...(options.coerce !== undefined ? { coerce: options.coerce } : {}),
    ...(options.formatDisplay !== undefined ? { formatDisplay: options.formatDisplay } : {}),
  })

  const { fieldCtx, handleControlledChange } = useFieldControlState<TValue>({
    props: options.props,
    fieldType: options.fieldType,
    state: optionResult,
    emitUpdate: value => options.emitUpdate(value),
  })

  function syncTextStorage(value: TValue): void {
    const storageField = options.props.textStorageField?.trim()
    if (!storageField || optionResult.contextData === null) return

    const labels = optionResult.findOptionLabels(value)
    optionResult.contextData[storageField] = labels.length > 1
      ? labels.join(options.props.textSeparator ?? ', ')
      : (labels[0] ?? '')
  }

  async function handleOptionFieldChange(value: TValue): Promise<void> {
    await handleControlledChange(value)
    syncTextStorage(value)
  }

  return {
    optionResult,
    fieldCtx,
    handleControlledChange: handleOptionFieldChange,
  }
}
