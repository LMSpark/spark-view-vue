import type { ComputedRef } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import type { FormItemRule } from '../../columnFormRules'
import type { SparkNodeChildren } from '../../../internal'
import { useFieldContext } from '../../context/useFieldContext'
import { useControlledFieldChange } from './useControlledFieldChange'

interface FieldContextStateLike {
  fieldName: ComputedRef<string>
  displayLabel: ComputedRef<string>
  isCurrentFieldHidden: ComputedRef<boolean>
  shouldRenderCurrentField: ComputedRef<boolean>
  currentDisplayValue: ComputedRef<string>
  isTableCellHidden: (row: IDataRow) => boolean
  getTableCellDisplayValue: (row: IDataRow) => string
  validationRules: ComputedRef<FormItemRule[]>
}

interface ControlledFieldStateLike<TValue> extends FieldContextStateLike {
  fieldValue: ComputedRef<TValue>
  syncValue: (value: TValue) => void
}

interface FieldControlProps {
  type?: string | undefined
  width?: number | undefined
  children?: SparkNodeChildren | undefined
}

interface UseFieldControlStateOptions<TValue> {
  props: FieldControlProps
  fieldType: string
  state: ControlledFieldStateLike<TValue>
  emitUpdate: (value: TValue) => void
}

export function useFieldControlState<TValue>(options: UseFieldControlStateOptions<TValue>) {
  const fieldCtx = useFieldContext({
    type: options.props.type ?? options.fieldType,
    width: options.props.width,
    ...(options.props.children !== undefined ? { children: options.props.children } : {}),
  }, options.state)

  const { handleControlledChange } = useControlledFieldChange<TValue>({
    getValue: () => options.state.fieldValue.value,
    emitUpdate: value => options.emitUpdate(value),
    syncValue: options.state.syncValue,
  })

  return {
    fieldCtx,
    handleControlledChange,
  }
}