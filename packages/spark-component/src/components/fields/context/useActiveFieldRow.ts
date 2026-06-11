/**
 * @module @spark-appworks/spark-component:components/fields/context/useActiveFieldRow
 * 职责：维护 @spark-appworks/spark-component 中 components/fields/context/useActiveFieldRow 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/fields/context/useActiveFieldRow 的声明、导出和使用边界时，从本模块开始。
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
