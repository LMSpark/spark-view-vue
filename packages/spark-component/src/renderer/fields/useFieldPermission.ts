import { computed } from 'vue'
import { createPermissionChecker, FieldVisibility } from '@spark-view/spark-data'
import type { IDataRow } from '@spark-view/spark-data'
import { PAGE_SERVICE } from '@spark-view/spark-utils'
import { useSparkComponent, DATA_SOURCE } from '../_pkg'
import { CONTEXT_DATA } from '../_pkg'
import { columnToFormRules } from './columnFormRules'
import type { FormItemRule } from './columnFormRules'
import { useResolvedFieldContext } from './useResolvedFieldContext'

export interface FieldPermissionProps<TValue> {
  field?: string | undefined
  label?: string | undefined
  modelValue?: TValue | undefined
}

interface UseFieldPermissionOptions<TValue> {
  props: FieldPermissionProps<TValue>
  type: string
  fallbackValue: TValue
  formatDisplay?: (value: unknown) => string
}

export function useFieldPermission<TValue>(options: UseFieldPermissionOptions<TValue>) {
  const { props, fallbackValue, formatDisplay } = options
  const permissionChecker = createPermissionChecker()
  const { sparkConsume } = useSparkComponent(undefined, { mode: 'consume-only' })

  const fieldName = computed(() => props.field ?? '')
  const displayLabel = computed(() => props.label ?? fieldName.value)
  const context = useResolvedFieldContext()
  const contextData = sparkConsume(CONTEXT_DATA)
  const pageService = sparkConsume(PAGE_SERVICE)
  const dataSource = sparkConsume(DATA_SOURCE)

  // 从 DataView.columns 提取当前字段的验证规则
  const validationRules = computed<FormItemRule[]>(() => {
    if (!fieldName.value || !dataSource?.columns) return []
    const column = dataSource.columns.find(c => c.name === fieldName.value)
    if (!column) return []
    return columnToFormRules(column)
  })

  const currentRow = computed<IDataRow | null>(() => {
    if (contextData === null || typeof contextData !== 'object') return null
    return contextData as IDataRow
  })

  const fieldValue = computed<TValue>(() => {
    if (props.modelValue !== undefined) return props.modelValue
    if (contextData !== null && fieldName.value && fieldName.value in contextData) {
      return contextData[fieldName.value] as TValue
    }
    return fallbackValue
  })
  const currentRawValue = computed(() => fieldValue.value)
  const currentRawStringValue = computed(() => String(currentRawValue.value ?? ''))

  const isCurrentFieldHidden = computed(() => {
    if (!fieldName.value || !currentRow.value) return false
    return permissionChecker.getFieldVisibility(fieldName.value, currentRow.value) === FieldVisibility.Hidden
  })

  const isCurrentFieldEditable = computed(() => {
    if (!fieldName.value || !currentRow.value) return true
    if (!currentRow.value._perm?.editableFields) return true
    return permissionChecker.isFieldEditable(fieldName.value, currentRow.value)
  })

  function formatValue(value: unknown): string {
    return formatDisplay ? formatDisplay(value) : String(value ?? '')
  }

  function getMaskedOrFormattedValue(row: IDataRow | null, value: unknown): string {
    if (!fieldName.value) return formatValue(value)
    if (row && permissionChecker.getFieldVisibility(fieldName.value, row) === FieldVisibility.Masked) {
      return permissionChecker.maskFieldValue(fieldName.value, value, row)
    }
    return formatValue(value)
  }

  const currentDisplayValue = computed(() => getMaskedOrFormattedValue(currentRow.value, fieldValue.value))

  function isTableCellHidden(row: IDataRow): boolean {
    if (!fieldName.value) return false
    return permissionChecker.getFieldVisibility(fieldName.value, row) === FieldVisibility.Hidden
  }

  function getRowRawValue(row: IDataRow): unknown {
    if (!fieldName.value) return fallbackValue
    return row[fieldName.value]
  }

  function getRowRawStringValue(row: IDataRow): string {
    return String(getRowRawValue(row) ?? '')
  }

  function getTableCellDisplayValue(row: IDataRow): string {
    if (!fieldName.value) return formatValue(fallbackValue)
    return getMaskedOrFormattedValue(row, getRowRawValue(row))
  }

  function syncValue(value: TValue): void {
    if (contextData !== null && fieldName.value) {
      contextData[fieldName.value] = value
    }
  }

  return {
    fieldName,
    displayLabel,
    context,
    contextData,
    pageService,
    currentRow,
    fieldValue,
    currentRawValue,
    currentRawStringValue,
    isCurrentFieldHidden,
    isCurrentFieldEditable,
    currentDisplayValue,
    isTableCellHidden,
    getRowRawValue,
    getRowRawStringValue,
    getTableCellDisplayValue,
    syncValue,
    validationRules,
  }
}