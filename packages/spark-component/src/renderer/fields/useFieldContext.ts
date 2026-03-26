import { computed, useAttrs } from 'vue'
import type { ComputedRef } from 'vue'
import { getSparkNodeChildren, type SparkNode } from '../_pkg'
import type { IDataRow } from '@spark-view/spark-data'
import type { FormItemRule } from './columnFormRules'

type TextAlign = 'left' | 'center' | 'right'

interface FieldContextProps {
  type: string
  displayLabel: string
  fieldName: string
  width: number | undefined
  titleAlign?: TextAlign
  valueAlign?: TextAlign
  headerCellClassName?: string
  cellClassName?: string
  titleClassName?: string
  valueClassName?: string
  mergedChildren: SparkNode[]
  isCurrentFieldHidden: boolean
  currentDisplayValue: string
  isTableCellHidden: (row: IDataRow) => boolean
  getTableCellDisplayValue: (row: IDataRow) => string
  validationRules: FormItemRule[]
}

/** useFieldPermission / useOptionField 返回值中 FieldContextRenderer 所需的子集 */
interface FieldPermissionForContext {
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
  fieldProps: { type: string; width: number | undefined; children?: SparkNode[] | undefined },
  permission: FieldPermissionForContext,
): ComputedRef<FieldContextProps> {
  const attrs = useAttrs()

  function readAttr(...keys: string[]): unknown {
    for (const key of keys) {
      const value = attrs[key]
      if (value !== undefined) return value
    }
    return undefined
  }

  function readAlign(value: unknown): TextAlign | undefined {
    if (value === 'left' || value === 'center' || value === 'right') return value
    return undefined
  }

  function readText(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined
  }

  const mergedChildren = computed(() => {
    const children = fieldProps.children
    return getSparkNodeChildren(children)
  })

  return computed(() => {
    const titleAlign = readAlign(readAttr('titleAlign', 'title-align'))
    const valueAlign = readAlign(readAttr('valueAlign', 'value-align'))
    const headerCellClassName = readText(readAttr('headerCellClassName', 'header-cell-class-name', 'labelClassName', 'label-class-name'))
    const cellClassName = readText(readAttr('cellClassName', 'cell-class-name', 'className', 'class-name'))
    const titleClassName = readText(readAttr('titleClassName', 'title-class-name'))
    const valueClassName = readText(readAttr('valueClassName', 'value-class-name'))

    const result: FieldContextProps = {
      type: fieldProps.type,
      displayLabel: permission.displayLabel.value,
      fieldName: permission.fieldName.value,
      width: fieldProps.width,
      ...(titleAlign !== undefined && { titleAlign }),
      ...(valueAlign !== undefined && { valueAlign }),
      ...(headerCellClassName !== undefined && { headerCellClassName }),
      ...(cellClassName !== undefined && { cellClassName }),
      ...(titleClassName !== undefined && { titleClassName }),
      ...(valueClassName !== undefined && { valueClassName }),
      mergedChildren: mergedChildren.value,
      isCurrentFieldHidden: permission.isCurrentFieldHidden.value,
      currentDisplayValue: permission.currentDisplayValue.value,
      isTableCellHidden: permission.isTableCellHidden,
      getTableCellDisplayValue: permission.getTableCellDisplayValue,
      validationRules: permission.validationRules.value,
    }

    return result
  })
}
