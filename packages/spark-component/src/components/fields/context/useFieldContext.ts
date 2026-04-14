import { computed, useAttrs } from 'vue'
import type { ComputedRef } from 'vue'
import { getSparkNodeChildren, type SparkNode } from '../../internal'
import type { IDataRow } from '@spark-view/spark-data'
import type { FormItemRule } from '../columnFormRules'
import type { SparkFieldProps } from '../../shared-types.js'

type TextAlign = 'left' | 'center' | 'right'

export interface FieldContextProps {
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
  shouldRenderCurrentField: boolean
  currentDisplayValue: string
  isTableCellHidden: (row: IDataRow) => boolean
  getTableCellDisplayValue: (row: IDataRow) => string
  validationRules: FormItemRule[]
}

interface FieldPermissionForContext {
  fieldName: ComputedRef<string>
  displayLabel: ComputedRef<string>
  isCurrentFieldHidden: ComputedRef<boolean>
  shouldRenderCurrentField: ComputedRef<boolean>
  currentDisplayValue: ComputedRef<string>
  isTableCellHidden: (row: IDataRow) => boolean
  getTableCellDisplayValue: (row: IDataRow) => string
  validationRules: ComputedRef<FormItemRule[]>
}

type OptionalWithUndefined<T> = {
  [K in keyof T]?: T[K] | undefined
}

type FieldContextInputProps = OptionalWithUndefined<Pick<SparkFieldProps, 'type' | 'width' | 'children'>> & {
  type: string
}

export function useFieldContext(
  fieldProps: FieldContextInputProps,
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
      shouldRenderCurrentField: permission.shouldRenderCurrentField.value,
      currentDisplayValue: permission.currentDisplayValue.value,
      isTableCellHidden: permission.isTableCellHidden,
      getTableCellDisplayValue: permission.getTableCellDisplayValue,
      validationRules: permission.validationRules.value,
    }

    return result
  })
}