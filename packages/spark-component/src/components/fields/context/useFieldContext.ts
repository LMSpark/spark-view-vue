/**
 * @module @spark-appworks/spark-component:components/fields/context/useFieldContext
 * @spark-appworks/spark-component 的 components/fields/context/useFieldContext 模块。
 * 导出 ClassModel symbol: FieldContextProps, FieldPermissionForContext, OptionalWithUndefined, FieldContextInputProps（共 4 个 symbol）。
 */
import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { getSparkNodeChildren, type SparkNode } from '../../internal'
import type { DataRow } from '@spark-appworks/spark-data'
import type { FormItemRule } from '../columnFormRules'
import type { SparkFieldSemanticProps, SparkNodeProps } from '../../shared-types.js'

/** Field Context Props 的属性契约。 */
export type FieldContextProps = {
    /** 类型标识。 */
type: string
    /** display Label 字段。 */
displayLabel: string
    /** 绑定字段名。 */
fieldName: string
    /** width 字段。 */
width: number | undefined
    /** resizable 字段。 */
resizable?: boolean
    /** title Align 字段。 */
titleAlign?: 'left' | 'center' | 'right'
    /** value Align 字段。 */
valueAlign?: 'left' | 'center' | 'right'
    /** header Cell Class Name 名称。 */
headerCellClassName?: string
    /** cell Class Name 名称。 */
cellClassName?: string
    /** title Class Name 名称。 */
titleClassName?: string
    /** value Class Name 名称。 */
valueClassName?: string
    /** sortable 字段。 */
sortable: boolean | 'custom'
    /** merged Children 字段。 */
mergedChildren: SparkNode[]
    /** 是否 is Current Field Hidden。 */
isCurrentFieldHidden: boolean
    /** 是否 should Render Current Field。 */
shouldRenderCurrentField: boolean
    /** current Display Value 字段。 */
currentDisplayValue: string
    /** 是否 is Table Cell Hidden。 */
isTableCellHidden: (row: DataRow) => boolean
    /** get Table Cell Display Value 回调。 */
getTableCellDisplayValue: (row: DataRow) => string
    /** validation Rules 字段。 */
validationRules: FormItemRule[]}

/** Field Permission For Context 的运行上下文。 */
type FieldPermissionForContext = {
    /** 绑定字段名。 */
fieldName: ComputedRef<string>
    /** display Label 字段。 */
displayLabel: ComputedRef<string>
    /** 是否 is Current Field Hidden。 */
isCurrentFieldHidden: ComputedRef<boolean>
    /** 是否 should Render Current Field。 */
shouldRenderCurrentField: ComputedRef<boolean>
    /** current Display Value 字段。 */
currentDisplayValue: ComputedRef<string>
    /** 是否 is Table Cell Hidden。 */
isTableCellHidden: (row: DataRow) => boolean
    /** get Table Cell Display Value 回调。 */
getTableCellDisplayValue: (row: DataRow) => string
    /** validation Rules 字段。 */
validationRules: ComputedRef<FormItemRule[]>}

/** Optional With Undefined 的语义模型。 */
type OptionalWithUndefined<T> = {
  [K in keyof T]?: T[K] | undefined
}

/** Field Context Input Props 的属性契约。 */
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
    /** 类型标识。 */
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
