import { computed } from 'vue'
import { FieldVisibility } from '@spark-view/spark-data'
import type { DataColumn } from '@spark-view/spark-data'
import type { IDataRow } from '@spark-view/spark-data'
import { PAGE_SERVICE } from '../../internal'
import { usePermission } from '../../../permission/index.js'
import type { SparkFieldProps } from '../../shared-types.js'
import { useSparkConsume } from '../../internal'
import { columnToFormRules } from '../columnFormRules'
import type { FormItemRule } from '../columnFormRules'
import { useActiveFieldRow } from './useActiveFieldRow'

type OptionalWithUndefined<T> = {
  [K in keyof T]?: T[K] | undefined
}

export interface FieldPermissionProps<TValue>
  extends OptionalWithUndefined<Omit<Pick<SparkFieldProps, 'field' | 'label' | 'value'>, 'value'>> {
  value?: TValue | undefined
}

interface UseFieldPermissionOptions<TValue> {
  props: FieldPermissionProps<TValue>
  type: string
  fallbackValue: TValue
  formatDisplay?: (value: unknown) => string
}

export function useFieldPermission<TValue>(options: UseFieldPermissionOptions<TValue>) {
  const { props, fallbackValue, formatDisplay } = options
  const { sparkConsume } = useSparkConsume()

  const fieldName = computed(() => props.field ?? '')
  const displayLabel = computed(() => props.label ?? fieldName.value)
  const { contextData, dataSource, activeRow, activeSelectedRows } = useActiveFieldRow()
  const pageService = sparkConsume(PAGE_SERVICE)
  const perm = usePermission()

  const boundColumn = computed<DataColumn | null>(() => {
    if (!fieldName.value || !dataSource?.columns) return null
    return dataSource.columns.find(c => c.name === fieldName.value) ?? null
  })

  const validationRules = computed<FormItemRule[]>(() => {
    const column = boundColumn.value
    if (!column) return []
    return columnToFormRules(column)
  })

  const currentRow = computed<IDataRow | null>(() => activeRow.value)
  const selectedRows = computed<IDataRow[]>(() => activeSelectedRows.value)

  const sourceFieldValue = computed<TValue>(() => {
    if (props.value !== undefined) return props.value
    const row = activeRow.value
    if (row !== null && fieldName.value && fieldName.value in row) {
      return row[fieldName.value] as TValue
    }
    return fallbackValue
  })

  const currentFieldState = computed(() =>
    perm.resolveFieldState(fieldName.value, currentRow.value)
  )

  const permissionMode = computed(() => perm.permissionMode)

  const isCurrentFieldReadable = computed(() => {
    return currentFieldState.value?.readable ?? true
  })

  const isCurrentFieldHidden = computed(() => {
    return currentFieldState.value?.visibility === FieldVisibility.Hidden
  })

  const isCurrentFieldEditable = computed(() => {
    return currentFieldState.value?.editable ?? false
  })

  const shouldSuppressReadableValueWhenWritable = computed(() => {
    const state = currentFieldState.value
    if (!state?.editable) return false
    return state.visibility !== FieldVisibility.Visible
  })

  const fieldValue = computed<TValue>(() => {
    if (shouldSuppressReadableValueWhenWritable.value) return fallbackValue
    return sourceFieldValue.value
  })
  const currentRawValue = computed(() => fieldValue.value)
  const currentRawStringValue = computed(() => String(currentRawValue.value ?? ''))

  const shouldRenderCurrentField = computed(() => {
    const state = currentFieldState.value
    if (!state) return true
    return state.readable || state.editable
  })

  function formatValue(value: unknown): string {
    return formatDisplay ? formatDisplay(value) : String(value ?? '')
  }

  const currentDisplayValue = computed(() => {
    if (shouldSuppressReadableValueWhenWritable.value) return ''
    return perm.formatFieldValue(fieldName.value, sourceFieldValue.value, currentRow.value, formatValue)
  })

  function isTableCellHidden(row: IDataRow): boolean {
    return perm.resolveFieldState(fieldName.value, row)?.visibility === FieldVisibility.Hidden
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
    return perm.formatFieldValue(fieldName.value, getRowRawValue(row), row, formatValue)
  }

  function syncValue(value: TValue): void {
    const row = activeRow.value
    if (row !== null && fieldName.value) {
      row[fieldName.value] = value
    }
  }

  return {
    permissionMode,
    fieldName,
    displayLabel,
    boundColumn,
    contextData,
    pageService,
    currentRow,
    selectedRows,
    isCurrentFieldReadable,
    fieldValue,
    currentRawValue,
    currentRawStringValue,
    isCurrentFieldHidden,
    isCurrentFieldEditable,
    shouldRenderCurrentField,
    currentDisplayValue,
    isTableCellHidden,
    getRowRawValue,
    getRowRawStringValue,
    getTableCellDisplayValue,
    syncValue,
    validationRules,
  }
}