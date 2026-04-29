import type { ComputedRef } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import type { FormItemRule } from '../../columnFormRules'
import type { SparkFieldSemanticProps, SparkNodeProps } from '../../../shared-types.js'
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

type OptionalWithUndefined<T> = {
  [K in keyof T]?: T[K] | undefined
}

interface FieldControlProps extends OptionalWithUndefined<Pick<SparkNodeProps,
  | 'type' | 'children'
>>, OptionalWithUndefined<Pick<SparkFieldSemanticProps,
  | 'width'
  | 'onChange'
  | 'titleAlign' | 'valueAlign'
  | 'headerCellClassName' | 'cellClassName'
  | 'titleClassName' | 'valueClassName'
  | 'sortable'
>> {
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
    ...(options.props.titleAlign !== undefined ? { titleAlign: options.props.titleAlign } : {}),
    ...(options.props.valueAlign !== undefined ? { valueAlign: options.props.valueAlign } : {}),
    ...(options.props.headerCellClassName !== undefined ? { headerCellClassName: options.props.headerCellClassName } : {}),
    ...(options.props.cellClassName !== undefined ? { cellClassName: options.props.cellClassName } : {}),
    ...(options.props.titleClassName !== undefined ? { titleClassName: options.props.titleClassName } : {}),
    ...(options.props.valueClassName !== undefined ? { valueClassName: options.props.valueClassName } : {}),
    ...(options.props.sortable !== undefined ? { sortable: options.props.sortable } : {}),
  }, options.state)

  const { handleControlledChange } = useControlledFieldChange<TValue>({
    getValue: () => options.state.fieldValue.value,
    emitUpdate: value => options.emitUpdate(value),
    syncValue: options.state.syncValue,
    handlerSource: {
      ...(options.props.onChange !== undefined ? { onChange: options.props.onChange } : {}),
    },
  })

  return {
    fieldCtx,
    handleControlledChange,
  }
}