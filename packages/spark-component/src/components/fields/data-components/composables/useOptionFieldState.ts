import type { SparkNodeChildren } from '../../../internal'
import { useFieldControlState } from './useFieldControlState'
import { useOptionField } from '../../options/useFieldOptions'
import type { useFieldOptions } from '../../options/useFieldOptions'

interface OptionFieldProps<TValue> {
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
  optionChildrenField?: string | undefined
}

interface UseOptionFieldStateOptions<TValue> {
  props: OptionFieldProps<TValue>
  fieldType: string
  fallbackValue: TValue
  emitUpdate: (value: TValue) => void
  formatDisplay?: (value: unknown, helpers: ReturnType<typeof useFieldOptions>) => string
}

export function useOptionFieldState<TValue>(options: UseOptionFieldStateOptions<TValue>) {
  const optionResult = useOptionField<TValue>({
    props: options.props,
    type: options.fieldType,
    fallbackValue: options.fallbackValue,
    ...(options.formatDisplay !== undefined ? { formatDisplay: options.formatDisplay } : {}),
  })

  const { fieldCtx, handleControlledChange } = useFieldControlState<TValue>({
    props: options.props,
    fieldType: options.fieldType,
    state: optionResult,
    emitUpdate: value => options.emitUpdate(value),
  })

  return {
    optionResult,
    fieldCtx,
    handleControlledChange,
  }
}