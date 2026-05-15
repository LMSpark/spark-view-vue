import { computed, onScopeDispose, shallowRef } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import { DATA_ROW, DATA_SOURCE, useSparkConsume } from '../../internal'
import { isDataViewEditingSource, resolveDataViewEditingRow } from './dataViewEditing'

export function useActiveFieldRow() {
  const { sparkConsume } = useSparkConsume()
  const contextData = sparkConsume(DATA_ROW)
  const dataSource = sparkConsume(DATA_SOURCE)
  const dataSourceRevision = shallowRef(0)

  if (isDataViewEditingSource(dataSource) && typeof dataSource.subscribe === 'function') {
    const unsubscribe = dataSource.subscribe(() => {
      dataSourceRevision.value += 1
    })
    onScopeDispose(unsubscribe)
  }

  const activeRow = computed<IDataRow | null>(() => {
    dataSourceRevision.value
    const row = contextData ?? dataSource?.currentRow ?? null
    return resolveDataViewEditingRow(dataSource, row) ?? row
  })

  const activeSelectedRows = computed<IDataRow[]>(() => {
    const rows = dataSource?.selectedRows
    return rows === undefined ? [] : rows.slice()
  })

  return {
    contextData,
    dataSource,
    activeRow,
    activeSelectedRows,
  }
}
