import type { SparkFieldSemanticProps, SparkNodeProps } from '../../../shared-types.js'
import { useFieldPermission } from '../../context/useFieldPermission'
import type { FieldPermissionProps } from '../../context/useFieldPermission'
import { useFieldControlState } from './useFieldControlState'

type OptionalWithUndefined<T> = {
  [K in keyof T]?: T[K] | undefined
}

interface BasicFieldProps<TValue> extends FieldPermissionProps<TValue>, OptionalWithUndefined<Pick<SparkNodeProps,
    | 'type' | 'children'
  >>, OptionalWithUndefined<Pick<SparkFieldSemanticProps,
    | 'width'
    | 'resizable'
    | 'titleAlign' | 'valueAlign'
    | 'headerCellClassName' | 'cellClassName'
    | 'titleClassName' | 'valueClassName'
    | 'sortable'
  >> {}

interface UseBasicFieldStateOptions<TValue> {
  props: BasicFieldProps<TValue>
  fieldType: string
  fallbackValue: TValue
  emitUpdate: (value: TValue) => void
  formatDisplay?: (value: unknown) => string
  coerce: (rawValue: unknown) => TValue
}

export function useBasicFieldState<TValue>(options: UseBasicFieldStateOptions<TValue>) {
  const permission = useFieldPermission<TValue>({
    props: options.props,
    type: options.fieldType,
    fallbackValue: options.fallbackValue,
    coerce: options.coerce,
    ...(options.formatDisplay !== undefined ? { formatDisplay: options.formatDisplay } : {}),
  })

  const { fieldCtx, handleControlledChange } = useFieldControlState<TValue>({
    props: options.props,
    fieldType: options.fieldType,
    state: permission,
    emitUpdate: value => options.emitUpdate(value),
  })

  return {
    permission,
    fieldCtx,
    handleControlledChange,
  }
}
