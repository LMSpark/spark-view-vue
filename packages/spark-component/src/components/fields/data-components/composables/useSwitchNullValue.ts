import { computed, watchEffect } from 'vue'
import type { DataRow } from '@spark-view/spark-data'
import type { ValueRef } from '../../../shared-types.js'
import { isDataViewEditingSource } from '../../context/dataViewEditing'

interface BoundBooleanColumn {
  type: string
  allowDBNull?: boolean | undefined
}

interface UseSwitchNullValueOptions {
  boundColumn: ValueRef<BoundBooleanColumn | null | undefined>
  contextData: DataRow | null
  dataSource: unknown
  fieldName: ValueRef<string>
  syncValue: (value: boolean | null) => void
}

export function useSwitchNullValue(options: UseSwitchNullValueOptions) {
  const normalizedEmptyValue = computed<boolean | null>(() => {
    const column = options.boundColumn.value
    if (!column) return false
    const colType = column.type.toLowerCase()
    if (colType !== 'boolean' && colType !== 'bool') return false
    return column.allowDBNull === true ? null : false
  })

  watchEffect(() => {
    const contextData = options.contextData
    const fieldName = options.fieldName.value
    if (fieldName.length === 0 || contextData === null) return
    const column = options.boundColumn.value
    if (!column) return
    const colType = column.type.toLowerCase()
    if (colType !== 'boolean' && colType !== 'bool') return
    const raw = contextData[fieldName]
    if (raw === '' || raw === undefined) {
      if (isDataViewEditingSource(options.dataSource) && options.dataSource.getPkKey(contextData) === undefined) return
      options.syncValue(normalizedEmptyValue.value)
    }
  })

  return {
    normalizedEmptyValue,
  }
}