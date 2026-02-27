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
 *   - buildRowIndexMap : O(n) 构建 row→index 映射（加速 updateRowById 行对象替换）
 */

import type { IDataRow, EventContext } from '../types'
import type { EmitStateChangedFn, ILocalMutationHost } from './types'

export class LocalMutationDelegate {
  constructor(
    private readonly host: ILocalMutationHost,
    private readonly emitStateChanged: EmitStateChangedFn,
    private readonly mkCtx: () => EventContext,
  ) {}

  // ─────────────────────────────────────────────
  // 私有辅助
  // ─────────────────────────────────────────────

  /** 构建 row → index 映射（O(n)），供 updateRowById 原地更新 rowIndexMap 复用 */
  buildRowIndexMap(rows: IDataRow[]): Map<IDataRow, number> {
    const m = new Map<IDataRow, number>()
    let i = 0
    for (const row of rows) m.set(row, i++)
    return m
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
    // 行对象已替换：在 Map 中原地更新 O(1)，避免 updateRowById 时全量重建
    if (h.rowIndexMap) {
      h.rowIndexMap.delete(oldRow)
      h.rowIndexMap.set(newRow, idx)
    }

    // 主键未变，_currentRowId / _selectedRowIds 仍有效；只需通知 UI 重新从 getter 获取最新对象
    if (h._currentRowId === id) {
      this.emitStateChanged('currentRow', { row: h.currentRow, context: this.mkCtx() })
    }
    if (h._selectedRowIds.includes(id)) {
      this.emitStateChanged('selectedRows', { rows: h.selectedRows, context: this.mkCtx() })
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

    h.rows.splice(idx, 1)
    h.rowIndexMap = undefined  // 行集合已变，缓存失效

    if (h._currentRowId === id) {
      h._currentRowId = null
      this.emitStateChanged('currentRow', { row: null, context: this.mkCtx() })
    }

    if (h._selectedRowIds.length > 0) {
      const newIds = h._selectedRowIds.filter(sid => sid !== id)
      if (newIds.length !== h._selectedRowIds.length) {
        h._selectedRowIds.splice(0, h._selectedRowIds.length, ...newIds)
        this.emitStateChanged('selectedRows', { rows: h.selectedRows, context: this.mkCtx() })
      }
    }

    this.emitStateChanged('rows')
    return true
  }

  /** 本地整批替换所有行（响应式安全），清理无效选中引用，发射 stateChanged('rows') */
  replaceRows(rows: IDataRow[]): void {
    const h = this.host
    h.rows.splice(0, h.rows.length, ...rows)
    h.rowIndexMap = undefined  // 行集合已替换，缓存失效

    // 构建新行主键集合，清理已失效的选中状态
    const newPkSet = new Set<string | number>()
    for (const r of rows) {
      const pk = h.getPrimaryKeyValue(r)
      if (pk !== undefined) newPkSet.add(pk)
    }

    if (h._currentRowId !== null && !newPkSet.has(h._currentRowId)) {
      h._currentRowId = null
      this.emitStateChanged('currentRow', { row: null, context: this.mkCtx() })
    }

    if (h._selectedRowIds.length > 0) {
      const validIds = h._selectedRowIds.filter(id => newPkSet.has(id))
      if (validIds.length !== h._selectedRowIds.length) {
        h._selectedRowIds.splice(0, h._selectedRowIds.length, ...validIds)
        this.emitStateChanged('selectedRows', { rows: h.selectedRows, context: this.mkCtx() })
      }
    }

    this.emitStateChanged('rows')
  }
}
