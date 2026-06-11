/**
 * @module @spark-appworks/spark-component:components/fields/context/useActiveFieldRow
 * @spark-appworks/spark-component 的 components/fields/context/useActiveFieldRow 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
import { computed, onScopeDispose, shallowRef } from 'vue'
import type { DataRow } from '@spark-appworks/spark-data'
import { DATA_ROW, DATA_SOURCE, useSparkConsume } from '../../internal'
import { resolveDataViewEditingRow } from './dataViewEditing'

export function useActiveFieldRow() {
  const { sparkConsume } = useSparkConsume()
  const contextData = sparkConsume(DATA_ROW)
  const dataSource = sparkConsume(DATA_SOURCE)
  const dataSourceRevision = shallowRef(0)

  if (dataSource !== null) {
    const bumpRevision = () => {
      dataSourceRevision.value += 1
    }
    const eventNames: ReadonlyArray<
      | 'editingFieldChanged'
      | 'editingChanged'
      | 'rowsChanged'
      | 'currentRowChanged'
      | 'selectedRowsChanged'
      | 'cleared'
    > = [
      'editingFieldChanged',
      'editingChanged',
      'rowsChanged',
      'currentRowChanged',
      'selectedRowsChanged',
      'cleared',
    ]
    for (const eventName of eventNames) {
      dataSource.events.on(eventName, bumpRevision)
    }
    onScopeDispose(() => {
      for (const eventName of eventNames) {
        dataSource.events.off(eventName, bumpRevision)
      }
    })
  }

  const activeRow = computed<DataRow | null>(() => {
    dataSourceRevision.value
    const row = contextData ?? (dataSource === null ? null : dataSource.currentRow)
    return resolveDataViewEditingRow(dataSource, row) ?? row
  })

  const activeSelectedRows = computed<DataRow[]>(() => {
    return dataSource === null ? [] : dataSource.selectedRows.slice()
  })

  return {
    contextData,
    dataSource,
    activeRow,
    activeSelectedRows,
  }
}
