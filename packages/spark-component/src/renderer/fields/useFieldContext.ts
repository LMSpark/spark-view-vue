import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { ComponentConfig } from '../_pkg'
import type { IDataRow } from '@spark-view/spark-data'
import type { FormItemRule } from './columnFormRules'

export interface FieldContextProps {
  context: string
  displayLabel: string
  fieldName: string
  width: number | undefined
  mergedChildren: ComponentConfig[]
  isCurrentFieldHidden: boolean
  currentDisplayValue: string
  isTableCellHidden: (row: IDataRow) => boolean
  getTableCellDisplayValue: (row: IDataRow) => string
  validationRules: FormItemRule[]
}

/** useFieldPermission / useOptionField 返回值中 FieldContextRenderer 所需的子集 */
interface FieldPermissionForContext {
  context: string
  fieldName: ComputedRef<string>
  displayLabel: ComputedRef<string>
  isCurrentFieldHidden: ComputedRef<boolean>
  currentDisplayValue: ComputedRef<string>
  isTableCellHidden: (row: IDataRow) => boolean
  getTableCellDisplayValue: (row: IDataRow) => string
  validationRules: ComputedRef<FormItemRule[]>
}

/**
 * 构建 FieldContextRenderer 的 v-bind props。
 * 将 useFieldPermission 返回值 + 组件 props 聚合为一个响应式对象。
 */
export function useFieldContext(
  fieldProps: { width: number | undefined; config: ComponentConfig | undefined; sparkChildren: ComponentConfig[] | undefined },
  permission: FieldPermissionForContext,
): ComputedRef<FieldContextProps> {
  const mergedChildren = computed(() => fieldProps.config?.children ?? fieldProps.sparkChildren ?? [])

  return computed(() => ({
    context: permission.context,
    displayLabel: permission.displayLabel.value,
    fieldName: permission.fieldName.value,
    width: fieldProps.width,
    mergedChildren: mergedChildren.value,
    isCurrentFieldHidden: permission.isCurrentFieldHidden.value,
    currentDisplayValue: permission.currentDisplayValue.value,
    isTableCellHidden: permission.isTableCellHidden,
    getTableCellDisplayValue: permission.getTableCellDisplayValue,
    validationRules: permission.validationRules.value,
  }))
}
