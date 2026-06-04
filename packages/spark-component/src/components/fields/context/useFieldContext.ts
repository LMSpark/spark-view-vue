import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { getSparkNodeChildren, type SparkNode } from '../../internal'
import type { DataRow } from '@spark-appworks/spark-data'
import type { FormItemRule } from '../columnFormRules'
import type { SparkFieldSemanticProps, SparkNodeProps } from '../../shared-types.js'

export type FieldContextProps = {
  type: string
  displayLabel: string
  fieldName: string
  width: number | undefined
  resizable?: boolean
  titleAlign?: 'left' | 'center' | 'right'
  valueAlign?: 'left' | 'center' | 'right'
  headerCellClassName?: string
  cellClassName?: string
  titleClassName?: string
  valueClassName?: string
  sortable: boolean | 'custom'
  mergedChildren: SparkNode[]
  isCurrentFieldHidden: boolean
  shouldRenderCurrentField: boolean
  currentDisplayValue: string
  isTableCellHidden: (row: DataRow) => boolean
  getTableCellDisplayValue: (row: DataRow) => string
  validationRules: FormItemRule[]}

type FieldPermissionForContext = {
  fieldName: ComputedRef<string>
  displayLabel: ComputedRef<string>
  isCurrentFieldHidden: ComputedRef<boolean>
  shouldRenderCurrentField: ComputedRef<boolean>
  currentDisplayValue: ComputedRef<string>
  isTableCellHidden: (row: DataRow) => boolean
  getTableCellDisplayValue: (row: DataRow) => string
  validationRules: ComputedRef<FormItemRule[]>}

type OptionalWithUndefined<T> = {
  [K in keyof T]?: T[K] | undefined
}

type FieldContextInputProps = OptionalWithUndefined<Pick<SparkNodeProps,
  | 'type' | 'children'
>> & OptionalWithUndefined<Pick<SparkFieldSemanticProps,
  | 'width'
  | 'resizable'
  | 'titleAlign' | 'valueAlign'
  | 'headerCellClassName' | 'cellClassName'
  | 'titleClassName' | 'valueClassName'
  | 'sortable'
>> & {
  type: string}

export function useFieldContext(
  fieldProps: FieldContextInputProps,
  permission: FieldPermissionForContext,
): ComputedRef<FieldContextProps> {
  const mergedChildren = computed(() => {
    const children = fieldProps.children
    return getSparkNodeChildren(children)
  })

  return computed(() => {
    const result: FieldContextProps = {
      type: fieldProps.type,
      displayLabel: permission.displayLabel.value,
      fieldName: permission.fieldName.value,
      width: fieldProps.width,
      ...(fieldProps.resizable !== undefined ? { resizable: fieldProps.resizable } : {}),
      ...(fieldProps.titleAlign !== undefined && { titleAlign: fieldProps.titleAlign }),
      ...(fieldProps.valueAlign !== undefined && { valueAlign: fieldProps.valueAlign }),
      ...(fieldProps.headerCellClassName !== undefined && { headerCellClassName: fieldProps.headerCellClassName }),
      ...(fieldProps.cellClassName !== undefined && { cellClassName: fieldProps.cellClassName }),
      ...(fieldProps.titleClassName !== undefined && { titleClassName: fieldProps.titleClassName }),
      ...(fieldProps.valueClassName !== undefined && { valueClassName: fieldProps.valueClassName }),
      sortable: fieldProps.sortable ?? true,
      mergedChildren: mergedChildren.value,
      isCurrentFieldHidden: permission.isCurrentFieldHidden.value,
      shouldRenderCurrentField: permission.shouldRenderCurrentField.value,
      currentDisplayValue: permission.currentDisplayValue.value,
      isTableCellHidden: permission.isTableCellHidden,
      getTableCellDisplayValue: permission.getTableCellDisplayValue,
      validationRules: permission.validationRules.value,
    }

    return result
  })
}
