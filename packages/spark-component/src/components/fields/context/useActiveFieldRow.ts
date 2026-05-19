import { computed, onScopeDispose, shallowRef } from 'vue'
import type { DataRow } from '@spark-view/spark-data'
import { DATA_ROW, DATA_SOURCE, useSparkConsume } from '../../internal'
import { isDataViewEditingSource, resolveDataViewEditingRow } from './dataViewEditing'

export function useActiveFieldRow() {
  const { sparkConsume } = useSparkConsume()
  const contextData = sparkConsume(DATA_ROW)
  const dataSource = sparkConsume(DATA_SOURCE)
  const dataSourceRevision = shallowRef(0)

  if (isDataViewEditingSource(dataSource) && dataSource.events) {
    const bumpRevision = () => {
      dataSourceRevision.value += 1
    }
    const eventNames = [
      'editingFieldChanged',
      'editingChanged',
      'rowsChanged',
      'currentRowChanged',
      'selectedRowsChanged',
      'cleared',
    ] as const
    for (const eventName of eventNames) {
      dataSource.events.on(eventName, bumpRevision)
    }
    onScopeDispose(() => {
      for (const eventName of eventNames) {
        dataSource.events?.off(eventName, bumpRevision)
      }
    })
  }

  const activeRow = computed<DataRow | null>(() => {
    dataSourceRevision.value
    const row = contextData ?? dataSource?.currentRow ?? null
    return resolveDataViewEditingRow(dataSource, row) ?? row
  })

  const activeSelectedRows = computed<DataRow[]>(() => {
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
