/**
 * LocalMutationDelegate — 本地内存变更委托
 *
 * 承载 DataView 的本地行数据同步逻辑：
 *   - updateFromServer : 将服务端响应同步到 rows / total / page / pageSize
 *   - appendRow        : 追加单行（响应式安全）
 *   - updateRowById    : 按主键就地更新行，同步选中状态引用
 *   - deleteRowById    : 按主键删除行，清理选中状态
 *   - replaceRows      : 整批替换行，清理无效选中引用
 *
 * 私有辅助：
 *   - buildRowIndexMap : O(n) 构建 row→index 映射（加速 selectedRowIndices 计算）
 *   - mapRowsToIndices : 将行数组映射为索引数组
 */

import type { IDataRow, EventContext } from '../types'
import type { EmitStateChangedFn, ILocalMutationHost } from './types'
import { isSameRow } from '../core/utils'

export class LocalMutationDelegate {
  constructor(
    private readonly host: ILocalMutationHost,
    private readonly emitStateChanged: EmitStateChangedFn,
    private readonly mkCtx: () => EventContext,
  ) {}

  // ─────────────────────────────────────────────
  // 私有辅助
  // ─────────────────────────────────────────────

  /** 构建 row → index 映射（O(n)），供 deleteRowById / replaceRows / setSelectedRows 复用 */
  buildRowIndexMap(rows: IDataRow[]): Map<IDataRow, number> {
    const m = new Map<IDataRow, number>()
    let i = 0
    for (const row of rows) m.set(row, i++)
    return m
  }

  /** 将行数组映射为索引数组（单次遍历，无 -1 占位） */
  mapRowsToIndices(rows: IDataRow[], map: Map<IDataRow, number>): number[] {
    const result: number[] = []
    for (const r of rows) {
      const idx = map.get(r)
      if (idx !== undefined) result.push(idx)
    }
    return result
  }

  // ─────────────────────────────────────────────
  // 公共 API
  // ─────────────────────────────────────────────

  /**
   * 将服务端响应同步到本地字段（rows / total / page / pageSize）
   * splice 保持数组引用稳定，对 Vue 响应式友好
   */
  updateFromServer(
    data: { rows?: IDataRow[]; total?: number; page?: number; pageSize?: number } | IDataRow[],
  ): void {
    const h = this.host
    if (Array.isArray(data)) {
      h.rows.splice(0, h.rows.length, ...data)
    } else {
      if (data.rows) h.rows.splice(0, h.rows.length, ...data.rows)
      if (data.total !== undefined) h.total = data.total
      if (data.page !== undefined) h.page = data.page
      if (data.pageSize !== undefined) h.pageSize = data.pageSize
    }
    // 清除索引缓存（行数据变更后缓存失效）
    h.rowIndexMap = undefined
  }

  /** 本地追加一行，发射 stateChanged('rows') */
  appendRow(row: IDataRow): void {
    this.host.rows.push(row)
    this.host.rowIndexMap = undefined   // 新行未加入缓存，直接失效
    this.emitStateChanged('rows')
  }

  /**
   * 本地按主键部分更新一行，发射 stateChanged('rows')
   * 同步 currentRow / selectedRows 引用（引用已变，UI 需感知）
   * @returns 是否成功（行不存在时 false）
   */
  updateRowById(id: string | number, data: Partial<IDataRow>): boolean {
    const h = this.host
    const idx = h.rows.findIndex(r => h.getPrimaryKeyValue(r) === id)
    if (idx < 0) return false

    const oldRow = h.rows[idx]
    if (!oldRow) return false

    const newRow = { ...oldRow, ...data }
    h.rows[idx] = newRow
    // 行引用已替换：在 Map 中原地更新 O(1)，避免 setSelectedRows 时全量重建
    if (h.rowIndexMap) {
      h.rowIndexMap.delete(oldRow)
      h.rowIndexMap.set(newRow, idx)
    }

    // 每次 emit 独立调用 mkCtx()，确保 currentRow 与 selectedRows 事件各有唯一 eventId
    if (h.currentRow && isSameRow(h.currentRow, oldRow, h.primaryKey)) {
      h.currentRow = newRow
      this.emitStateChanged('currentRow', { row: newRow, context: this.mkCtx() })
    }

    if (h.selectedRows.length > 0) {
      const selectedIdx = h.selectedRows.findIndex(r => isSameRow(r, oldRow, h.primaryKey))
      if (selectedIdx !== -1) {
        h.selectedRows[selectedIdx] = newRow
        this.emitStateChanged('selectedRows', { rows: [...h.selectedRows], context: this.mkCtx() })
      }
    }

    this.emitStateChanged('rows')
    return true
  }

  /**
   * 本地按主键删除一行，清理选中引用，发射 stateChanged('rows')
   * @returns 是否成功（行不存在时 false）
   */
  deleteRowById(id: string | number): boolean {
    const h = this.host
    const idx = h.rows.findIndex(r => h.getPrimaryKeyValue(r) === id)
    if (idx < 0) return false

    const deletedRow = h.rows[idx]
    if (!deletedRow) return false

    h.rows.splice(idx, 1)
    // splice 后重建索引 Map（O(n)），供删除后 selectedRowIndices 更新复用
    const postDeleteMap = this.buildRowIndexMap(h.rows)
    h.rowIndexMap = postDeleteMap

    // 被删行是当前行 → 清空并立即通知（独立 eventId）
    if (h.currentRow && isSameRow(h.currentRow, deletedRow, h.primaryKey)) {
      h.currentRow = null
      h.currentRowIndex = null
      this.emitStateChanged('currentRow', { row: null, context: this.mkCtx() })
    }

    // 被删行在多选中 → 移除并立即通知（独立 eventId）
    if (h.selectedRows.length > 0) {
      const newSelected = h.selectedRows.filter(r => !isSameRow(r, deletedRow, h.primaryKey))
      if (newSelected.length !== h.selectedRows.length) {
        h.selectedRows.splice(0, h.selectedRows.length, ...newSelected)
        h.selectedRowIndices = this.mapRowsToIndices(newSelected, postDeleteMap)
        this.emitStateChanged('selectedRows', { rows: [...h.selectedRows], context: this.mkCtx() })
      }
    }

    this.emitStateChanged('rows')
    return true
  }

  /** 本地整批替换所有行（响应式安全），清理无效选中引用，发射 stateChanged('rows') */
  replaceRows(rows: IDataRow[]): void {
    const h = this.host
    h.rows.splice(0, h.rows.length, ...rows)
    // O(n) 构建索引 Map，供后续 selectedRowIndices 计算复用
    const idxMap = this.buildRowIndexMap(rows)
    h.rowIndexMap = idxMap

    const rowSet = new Set(rows)
    if (h.currentRow && !rowSet.has(h.currentRow)) {
      h.currentRow = null
      h.currentRowIndex = null
      this.emitStateChanged('currentRow', { row: null, context: this.mkCtx() })
    }
    if (h.selectedRows.length > 0) {
      const newSelected = h.selectedRows.filter(r => rowSet.has(r))
      if (newSelected.length !== h.selectedRows.length) {
        h.selectedRows.splice(0, h.selectedRows.length, ...newSelected)
        h.selectedRowIndices = this.mapRowsToIndices(newSelected, idxMap)
        this.emitStateChanged('selectedRows', { rows: [...h.selectedRows], context: this.mkCtx() })
      }
    }
    this.emitStateChanged('rows')
  }
}
