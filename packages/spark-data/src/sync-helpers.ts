/**
 * DataSet 同步辅助函数
 *
 * 提供 UI ↔ DataSet 双向数据同步的高层 API，
 * 使消费者（渲染层）无需直接操作 DataSet 内部结构（getTable → getOrCreateView → setXxx）。
 *
 * 设计原则：
 * - 渲染层只调用这些函数，不直接访问 DataTable/DataView 内部 API
 * - 数据写入和事件订阅的实现细节由 spark-data 封装
 */

import { Logger } from '@spark-view/spark-utils'
import type { IDataSet, IDataRow, ViewStateEvent } from './types'

const logger = Logger('SparkData:Sync')

// ─────────────────────────────────────────────
// UI → DataSet 方向：数据写入
// ─────────────────────────────────────────────

export interface TableSyncHandlers {
  /** UI 当前行变化时调用（el-table currentChange） */
  onCurrentChange: (row: IDataRow | null) => void
  /** UI 多选变化时调用（el-table selectionChange） */
  onSelectionChange: (rows: IDataRow[]) => void
}

/**
 * 创建表视图数据同步写入器
 *
 * 消费者（如渲染层 bindRules）调用此函数获取两个写入函数，
 * 在 UI 事件回调中调用即可将用户操作同步写入 DataSet。
 *
 * @param dataSet - DataSet 实例
 * @param tableName - 表名
 * @param viewId - 视图 ID
 * @returns 包含 onCurrentChange 和 onSelectionChange 的写入器对象
 *
 * @example
 * ```typescript
 * const sync = createTableSyncHandlers(dataSet, 'Users', 'grid')
 * // 在 el-table 事件回调中：
 * sync.onCurrentChange(currentRow)
 * sync.onSelectionChange(selectedRows)
 * ```
 */
export function createTableSyncHandlers(
  dataSet: IDataSet,
  tableName: string,
  viewId: string
): TableSyncHandlers {
  return {
    onCurrentChange(row: IDataRow | null) {
      const table = dataSet.getTable(tableName)
      if (table) {
        const view = table.getOrCreateView(viewId)
        view.setCurrentRow(row)
        logger.debug('同步 currentRow', { tableName, viewId })
      } else {
        logger.warn('表不存在', { tableName })
      }
    },

    onSelectionChange(rows: IDataRow[]) {
      const table = dataSet.getTable(tableName)
      if (table) {
        const view = table.getOrCreateView(viewId)
        view.setSelectedRows(rows)
        logger.debug('同步 selectedRows', { tableName, viewId, count: rows.length })
      } else {
        logger.warn('表不存在', { tableName })
      }
    }
  }
}

// ─────────────────────────────────────────────
// DataSet → UI 方向：事件订阅
// ─────────────────────────────────────────────

export interface ViewStateChangeCallback {
  (tableName: string, viewId: string, event: ViewStateEvent): void
}

/**
 * 订阅 DataSet 中所有已存在视图的 stateChanged 事件
 *
 * 遍历 DataSet 的所有表和视图，为每个视图订阅 stateChanged 事件。
 * 返回清理函数，调用后取消所有订阅（用于组件卸载或 DataSet 重建场景）。
 *
 * @param dataSet - DataSet 实例
 * @param callback - 状态变化回调（接收 tableName、viewId 和事件对象）
 * @returns 清理函数，调用后取消所有订阅
 *
 * @example
 * ```typescript
 * const unsub = subscribeViewStateChanges(dataSet, (tableName, viewId, event) => {
 *   if (event.changeType === 'selectedRows') {
 *     syncSelectedRowsToUI(tableName, viewId, event.rows ?? [])
 *   }
 * })
 *
 * // 组件卸载时清理
 * onUnmounted(() => unsub())
 * ```
 */
export function subscribeViewStateChanges(
  dataSet: IDataSet,
  callback: ViewStateChangeCallback
): () => void {
  const cleanupFns: Array<() => void> = []

  for (const table of Object.values(dataSet.tables)) {
    for (const [viewId, view] of Object.entries(table.views)) {
      const handler = (event: ViewStateEvent) => {
        callback(table.tableName, viewId, event)
      }
      view.events.on('stateChanged', handler)
      cleanupFns.push(() => view.events.off('stateChanged', handler))
      logger.debug('已订阅视图', { tableName: table.tableName, viewId })
    }
  }

  return () => {
    cleanupFns.forEach(fn => fn())
    cleanupFns.length = 0
  }
}
