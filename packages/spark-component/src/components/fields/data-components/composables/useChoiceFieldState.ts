import { useOptionFieldState } from './useOptionFieldState'
import type { OptionFieldStateProps } from './useOptionFieldState'

interface UseChoiceFieldStateOptions<TValue> {
  props: OptionFieldStateProps<TValue>
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