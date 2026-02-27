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
  viewId: string,
  /**
   * 当前 useRuleBinding 实例的唯一标识。
   *
   * 注入后，setCurrentRow/setSelectedRows 会将其写入 EventContext.originatorId，
   * useRuleBinding 的 onAnyViewChange 过滤逻辑可据此只跳过本实例的回写，
   * 同一 DataView 上的其他 binding 实例仍会收到通知并执行 DataSet→UI 同步。
   */
  bindingId?: string
): TableSyncHandlers {
  return {
    onCurrentChange(row: IDataRow | null) {
      const table = dataSet.getTable(tableName)
      if (!table) return
      
      const view = table.getOrCreateView(viewId)
      
      if (row === null) {
        view.setCurrentRow(null, 'ui', bindingId !== undefined ? { originatorId: bindingId } : undefined)
        logger.debug('清空 currentRow', { tableName, viewId })
        return
      }
      
      // ✅ 修复：form-create 污染了原始对象（添加了 $f, api, rule 等内部属性）
      // 原始数据被保存在 row.args[0] 中
      let cleanRow: IDataRow | null = null
      
      // 优先方案：从 args[0] 提取原始数据（污染检测）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      if ('args' in row && Array.isArray((row as any).args)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const originalRow = (row as any).args[0]
        if (originalRow && typeof originalRow === 'object') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          cleanRow = originalRow
          logger.debug('从 args[0] 提取原始数据', {
            tableName,
            viewId,
            id: cleanRow ? view.getPrimaryKeyValue(cleanRow) : null
          })
        }
      }
      
      // 回退方案：通过主键从 view.rows 查找
      if (!cleanRow) {
        const rowPk = view.getPrimaryKeyValue(row)
        
        if (rowPk !== undefined) {
          cleanRow = view.rows.find(r => view.getPrimaryKeyValue(r) === rowPk) ?? null
          if (cleanRow) {
            logger.debug('通过主键查找到原始数据', { tableName, viewId, pk: view.primaryKey, id: rowPk })
          } else {
            logger.warn('在 view.rows 中找不到匹配行', {
              tableName,
              viewId,
              pk: view.primaryKey,
              id: rowPk
            })
          }
        }
      }
      
      // 设置干净的行对象
      if (cleanRow) {
        view.setCurrentRow(cleanRow, 'ui', bindingId !== undefined ? { originatorId: bindingId } : undefined)
      }
    },

    onSelectionChange(rows: IDataRow[]) {
      const table = dataSet.getTable(tableName)
      if (table) {
        const view = table.getOrCreateView(viewId)
        // ✅ 修复：el-table selectionChange 事件可能传入非数组参数，做防御性检查
        const validRows = Array.isArray(rows) ? rows : []
        view.setSelectedRows(validRows, 'ui', bindingId)
        logger.debug('同步 selectedRows', { tableName, viewId, count: validRows.length })
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
