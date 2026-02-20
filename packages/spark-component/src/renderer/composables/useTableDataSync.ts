/**
 * DataSet ↔ el-table 双向同步桥 Composable
 *
 * 职责（单一来源）：
 *  - DataSet → UI：订阅 DataView.stateChanged → 驱动 el-table 选中行 UI 更新
 *  - 清理：组件卸载时自动移除所有订阅
 *
 * 注意：
 *  - UI → DataSet 方向由 bindRules.injectTableEvents 在规则绑定时完成（注入 currentChange/selectionChange 事件处理器）
 *  - 此 composable 不负责 UI → DataSet 方向，避免双重持有
 *
 * 使用示例：
 * ```typescript
 * const { setupSync } = useTableDataSync({ dataSet, formApi })
 *
 * // 在 rebindRules() 之后调用（injectTableEvents 已创建视图）
 * rebindRules()
 * setupSync()
 * ```
 */

import { type Ref, onUnmounted } from 'vue'
import { nextTick } from 'vue'
import { Logger } from '@spark-view/spark-utils'
import type { DataSet } from '@spark-view/spark-data'
import type { ViewStateEvent, IDataRow } from '@spark-view/spark-data'
import type { FormCreateAPI } from '../types'

const logger = Logger('PageRenderer')

// ─────────────────────────────────────────────
// 内部类型
// ─────────────────────────────────────────────

/** ElementPlus el-table 实例接口（渲染层内部） */
interface ElTableComponent extends HTMLElement {
  clearSelection?: () => void
  toggleRowSelection?: (row: IDataRow, selected: boolean) => void
}

// ─────────────────────────────────────────────
// 内部工具函数
// ─────────────────────────────────────────────

/**
 * 将 DataSet 中的选中行同步到 el-table UI
 *
 * 通过 FormCreate API 查找命名为 `table_{tableName}_{viewId}` 的组件，
 * 调用 el-table 的 clearSelection / toggleRowSelection API 更新 UI。
 */
function syncSelectedRowsToTable(
  tableName: string,
  viewId: string,
  rows: IDataRow[],
  formApi: FormCreateAPI | null
): void {
  void nextTick(() => {
    if (formApi && typeof formApi.el === 'function') {
      const componentName = `table_${tableName}_${viewId}`
      const tableComponent = formApi.el(componentName) as ElTableComponent | null

      if (tableComponent) {
        if (rows.length === 0 && typeof tableComponent.clearSelection === 'function') {
          tableComponent.clearSelection()
        } else if (typeof tableComponent.toggleRowSelection === 'function') {
          tableComponent.clearSelection?.()
          rows.forEach(row => {
            tableComponent.toggleRowSelection?.(row, true)
          })
        }
      }
    }
  })
}

// ─────────────────────────────────────────────
// Composable
// ─────────────────────────────────────────────

export interface UseTableDataSyncOptions {
  dataSet: Ref<DataSet | null>
  formApi: Ref<FormCreateAPI | null>
}

/**
 * DataSet → el-table 单向同步桥
 *
 * `setupSync()` 应在 `rebindRules()` 之后调用：
 *  - `bindRules.injectTableEvents` 会通过 `getOrCreateView` 创建 DataView，
 *  - 此时再订阅，视图已存在，订阅不会遗漏。
 *
 * 每次调用 `setupSync()` 会先清理旧订阅，可安全重复调用（DataSet 重建场景）。
 */
export function useTableDataSync(options: UseTableDataSyncOptions) {
  const { dataSet, formApi } = options
  const cleanupFns: Array<() => void> = []

  /**
   * 订阅 DataSet 中所有已存在视图的 stateChanged 事件
   *
   * 每次调用都会先清理旧订阅再重新订阅，支持 DataSet 重建场景。
   */
  const setupSync = () => {
    // 清理旧订阅
    cleanupFns.forEach(fn => fn())
    cleanupFns.length = 0

    if (!dataSet.value) return

    // 订阅所有已存在的视图（由 bindRules.injectTableEvents 通过 getOrCreateView 创建）
    for (const table of Object.values(dataSet.value.tables)) {
      for (const [viewId, view] of Object.entries(table.views)) {
        const handler = (event: ViewStateEvent) => {
          if (event.changeType === 'selectedRows') {
            const rows = event.rows ?? []
            logger.debug('selectedRows 变化 → 同步 el-table', {
              tableName: table.tableName,
              viewId,
              rowCount: rows.length
            })
            syncSelectedRowsToTable(table.tableName, viewId, rows, formApi.value)
          }
        }

        view.events.on('stateChanged', handler)
        cleanupFns.push(() => view.events.off('stateChanged', handler))
        logger.debug('已订阅视图同步', { tableName: table.tableName, viewId })
      }
    }
  }

  // 组件卸载时清理所有订阅，避免内存泄漏
  onUnmounted(() => {
    cleanupFns.forEach(fn => fn())
    cleanupFns.length = 0
  })

  return { setupSync }
}
