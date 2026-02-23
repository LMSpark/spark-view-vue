/**
 * @deprecated 全局事件总线已废弃。
 * 请使用 DataSet.onAnyViewChange(handler) 替代。
 * 作用域隔离于 DataSet 实例，多页面并存时互不干扰。
 */
import mitt from 'mitt'
import type { IDataRow, EventContext } from './types'

// ─────────────────────────────────────────────
// 全局事件总线（mitt）
// ─────────────────────────────────────────────

export interface ViewCurrentRowPayload {
  tableName: string
  viewId: string
  row: IDataRow | null
  context: EventContext
}

export interface ViewSelectedRowsPayload {
  tableName: string
  viewId: string
  rows: IDataRow[]
  context: EventContext
}

export const bus = mitt<{
  /** DataView.setCurrentRow 调用后广播（UI↔DataSet 双向同步） */
  'view:currentRow': ViewCurrentRowPayload
  /** DataView.setSelectedRows 调用后广播（UI↔DataSet 双向同步） */
  'view:selectedRows': ViewSelectedRowsPayload
}>()
