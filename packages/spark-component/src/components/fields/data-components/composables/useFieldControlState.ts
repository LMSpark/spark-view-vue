import type { ComputedRef } from 'vue'
import type { DataRow } from '@spark-appworks/spark-data'
import type { FormItemRule } from '../../columnFormRules'
import type { SparkFieldSemanticProps, SparkNodeProps } from '../../../shared-types.js'
import { useFieldContext } from '../../context/useFieldContext'
import { useControlledFieldChange } from './useControlledFieldChange'

type FieldContextStateLike = {
  fieldName: ComputedRef<string>
  displayLabel: ComputedRef<string>
  isCurrentFieldHidden: ComputedRef<boolean>
  shouldRenderCurrentField: ComputedRef<boolean>
  currentDisplayValue: ComputedRef<string>
  isTableCellHidden: (row: DataRow) => boolean
  getTableCellDisplayValue: (row: DataRow) => string
  validationRules: ComputedRef<FormItemRule[]>}

type ControlledFieldStateLike<TValue> = FieldContextStateLike & {
  fieldValue: ComputedRef<TValue>
    contextData: DataRow | null
    dataSource: unknown
    currentRow: ComputedRef<DataRow | null>
    syncValue: (value: TValue) => void}

type OptionalWithUndefined<T> = {
  [K in keyof T]?: T[K] | undefined
}

type FieldControlProps = OptionalWithUndefined<Pick<SparkNodeProps,
  | 'type' | 'children'
>> & OptionalWithUndefined<Pick<SparkFieldSemanticProps,
  | 'width'
  | 'resizable'
  | 'onChange'
  | 'titleAlign' | 'valueAlign'
  | 'headerCellClassName' | 'cellClassName'
  | 'titleClassName' | 'valueClassName'
  | 'sortable'
>>

type UseFieldControlStateOptions<TValue> = {
  props: FieldControlProps
  fieldType: string
  state: ControlledFieldStateLike<TValue>
  emitUpdate: (value: TValue) => void}

export function useFieldControlState<TValue>(options: UseFieldControlStateOptions<TValue>) {
  const fieldCtx = useFieldContext({
    type: options.props.type ?? options.fieldType,
    width: options.props.width,
    ...(options.props.resizable !== undefined ? { resizable: options.props.resizable } : {}),
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
