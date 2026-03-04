/**
 * el-table DataSet → UI 同步委托
 *
 * 职责：DataSet 数据变化 → el-table 命令式 API 同步（setCurrentRow / toggleRowSelection）
 *
 * el-table 没有 v-model:selection，必须通过命令式 API 驱动选中行高亮。
 * 本模块封装 el-table 实例查找 + 选中行同步逻辑。
 *
 * 数据流向：
 *   DataSet.onAnyViewChange → syncCurrentRowToTable / syncSelectedRowsToTable → el-table 命令式 API
 *
 * 反向（UI → DataSet）由 bind-table-delegate 的 injectTableEvents 在规则绑定时完成。
 */

import { nextTick } from 'vue'
import { Logger } from '@spark-view/spark-utils'
import type { IDataRow } from '@spark-view/spark-data'
import type { FormCreateAPI } from '../types'

const pageLogger = Logger('PageRenderer')

// ── el-table 命令式接口（Element Plus 原生，无响应式绑定） ─────────────────

/** ElementPlus el-table 实例需要命令式驱动选中行的 API 子集 */
export interface ElTableComponent extends HTMLElement {
  clearSelection?: () => void
  toggleRowSelection?: (row: IDataRow, selected: boolean) => void
  setCurrentRow?: (row: IDataRow | null) => void
}

// ── 实例查找 ──────────────────────────────────────────────────────────────

/**
 * 通过 formApi 查找指定表格的 el-table 实例
 *
 * 命名约定：bindTableRule 在注入时设置 `rule.name = table_{tableName}_{viewId}`，
 * formApi.el() 通过该 name 查找组件实例。
 */
export function getTableEl(
  tableName: string,
  viewId: string,
  formApi: FormCreateAPI | null
): ElTableComponent | null {
  if (!formApi || typeof formApi.el !== 'function') return null
  const el = formApi.el(`table_${tableName}_${viewId}`) as ElTableComponent | null
  // duck-typing 守卫：确保返回的组件实例确实具有 el-table 命令式 API
  return el && typeof el.setCurrentRow === 'function' ? el : null
}

// ── 当前行同步 ────────────────────────────────────────────────────────────

/**
 * 将 DataSet 当前行同步到 el-table UI（DataSet → UI 方向）
 *
 * 通过 formApi.el() 查找 el-table 实例，调用 setCurrentRow 更新高亮行。
 */
export function syncCurrentRowToTable(
  tableName: string,
  viewId: string,
  row: IDataRow | null,
  formApi: FormCreateAPI | null
): void {
  nextTick(() => {
    const table = getTableEl(tableName, viewId, formApi)
    if (!table) return
    table.setCurrentRow?.(row)
    pageLogger.debug('✅ [DataSet→UI] 同步 currentRow 到 el-table', { tableName, viewId, hasRow: !!row })
  }).catch(() => { /* nextTick 内部回调异常安全 */ })
}

// ── 选中行同步 ────────────────────────────────────────────────────────────

/**
 * 将 DataSet 选中行同步到 el-table UI（DataSet → UI 方向）
 *
 * 通过 formApi.el() 查找 el-table 实例，调用命令式 API 更新选中状态。
 */
export function syncSelectedRowsToTable(
  tableName: string,
  viewId: string,
  rows: IDataRow[],
  formApi: FormCreateAPI | null
): void {
  nextTick(() => {
    const table = getTableEl(tableName, viewId, formApi)
    if (!table) return
    if (rows.length === 0) {
      table.clearSelection?.()
    } else {
      table.clearSelection?.()
      for (const row of rows) table.toggleRowSelection?.(row, true)
    }
  }).catch(() => { /* nextTick 内部回调异常安全 */ })
}
