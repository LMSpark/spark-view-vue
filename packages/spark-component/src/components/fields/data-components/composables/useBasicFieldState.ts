import type { SparkNodeChildren } from '../../../internal'
import { useFieldPermission } from '../../context/useFieldPermission'
import type { FieldPermissionProps } from '../../context/useFieldPermission'
import { useFieldControlState } from './useFieldControlState'

interface BasicFieldProps<TValue> extends FieldPermissionProps<TValue> {
  type?: string | undefined
  width?: number | undefined
  children?: SparkNodeChildren | undefined
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