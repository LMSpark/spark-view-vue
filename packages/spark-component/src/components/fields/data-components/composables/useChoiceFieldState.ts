import type { SparkNodeChildren } from '../../../internal'
import { useOptionFieldState } from './useOptionFieldState'

interface ChoiceFieldProps<TValue> {
  type?: string | undefined
  width?: number | undefined
  children?: SparkNodeChildren | undefined
  modelValue?: TValue | undefined
  field?: string | undefined
  label?: string | undefined
  options?: unknown[] | undefined
  optionKey?: string | undefined
  optionLabelField?: string | undefined
  optionValueField?: string | undefined
}

interface UseChoiceFieldStateOptions<TValue> {
  props: ChoiceFieldProps<TValue>
  fieldType: string
  fallbackValue: TValue
  emitUpdate: (value: TValue) => void
}

export function useChoiceFieldState<TValue>(
  options: UseChoiceFieldStateOptions<TValue>,
) {
  const { optionResult, fieldCtx, handleControlledChange } = useOptionFieldState<TValue>({
    props: options.props,
    fieldType: options.fieldType,
    fallbackValue: options.fallbackValue,
    emitUpdate: value => options.emitUpdate(value),
  })

  return {
    fieldOptions: optionResult.options,
    fieldValue: optionResult.fieldValue,
    isCurrentFieldEditable: optionResult.isCurrentFieldEditable,
    fieldCtx,
    handleControlledChange,
  }
}