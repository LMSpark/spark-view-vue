import { computed } from 'vue'
import { FieldVisibility } from '@spark-view/spark-data'
import type { DataColumn } from '@spark-view/spark-data'
import type { IDataRow } from '@spark-view/spark-data'
import { PAGE_SERVICE } from '@spark-view/spark-utils'
import { usePermission } from '../../../permission/index.js'
import type { SparkFieldProps } from '../../shared-types.js'
import { useSparkConsume, DATA_SOURCE, DATA_ROW } from '../../internal'
import { columnToFormRules } from '../columnFormRules'
import type { FormItemRule } from '../columnFormRules'
import { useResolvedFieldContext } from './useResolvedFieldContext'

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
  const context = useResolvedFieldContext()
  const contextData = sparkConsume(DATA_ROW)
  const pageService = sparkConsume(PAGE_SERVICE)
  const dataSource = sparkConsume(DATA_SOURCE)
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

  const currentRow = computed<IDataRow | null>(() => {
    return contextData
  })

  const sourceFieldValue = computed<TValue>(() => {
    if (props.value !== undefined) return props.value
    if (contextData !== null && fieldName.value && fieldName.value in contextData) {
      return contextData[fieldName.value] as TValue
    }
    return fallbackValue
  })

  const currentFieldState = computed(() =>
    perm.resolveFieldState(fieldName.value, currentRow.value)
  )

  const isCurrentFieldReadable = computed(() => {
    return currentFieldState.value?.readable ?? true
  })

  const isCurrentFieldHidden = computed(() => {
    return currentFieldState.value?.visibility === FieldVisibility.Hidden
  })

  const isCurrentFieldEditable = computed(() => {
    return currentFieldState.value?.editable ?? false
  })

  const shouldSuppressReadableValueInWritableForm = computed(() => {
    if (context.value !== 'form') return false
    const state = currentFieldState.value
    if (!state?.editable) return false
    return state.visibility !== FieldVisibility.Visible
  })

  const fieldValue = computed<TValue>(() => {
    if (shouldSuppressReadableValueInWritableForm.value) return fallbackValue
    return sourceFieldValue.value
  })
  const currentRawValue = computed(() => fieldValue.value)
  const currentRawStringValue = computed(() => String(currentRawValue.value ?? ''))

  const shouldRenderCurrentField = computed(() => {
    const state = currentFieldState.value
    if (!state) return true
    if (context.value === 'form') return state.readable || state.editable
    return state.readable
  })

  function formatValue(value: unknown): string {
    return formatDisplay ? formatDisplay(value) : String(value ?? '')
  }

  const currentDisplayValue = computed(() => {
    if (shouldSuppressReadableValueInWritableForm.value) return ''
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
    if (contextData !== null && fieldName.value) {
      contextData[fieldName.value] = value
    }
  }

  return {
    fieldName,
    displayLabel,
    boundColumn,
    context,
    contextData,
    pageService,
    currentRow,
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