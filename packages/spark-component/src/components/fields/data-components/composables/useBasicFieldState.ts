import type { SparkFieldProps } from '../../../shared-types.js'
import { useFieldPermission } from '../../context/useFieldPermission'
import type { FieldPermissionProps } from '../../context/useFieldPermission'
import { useFieldControlState } from './useFieldControlState'

type OptionalWithUndefined<T> = {
  [K in keyof T]?: T[K] | undefined
}

interface BasicFieldProps<TValue>
  extends FieldPermissionProps<TValue>, OptionalWithUndefined<Pick<SparkFieldProps,
    | 'type' | 'width' | 'children'
    | 'titleAlign' | 'valueAlign'
    | 'headerCellClassName' | 'cellClassName'
    | 'titleClassName' | 'valueClassName'
  >> {
}

interface UseBasicFieldStateOptions<TValue> {
  props: BasicFieldProps<TValue>
  fieldType: string
  fallbackValue: TValue
  emitUpdate: (value: TValue) => void
  formatDisplay?: (value: unknown) => string
}

export function useBasicFieldState<TValue>(options: UseBasicFieldStateOptions<TValue>) {
  const permission = useFieldPermission<TValue>({
    props: options.props,
    type: options.fieldType,
    fallbackValue: options.fallbackValue,
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