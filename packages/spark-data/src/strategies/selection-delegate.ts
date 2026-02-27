/**
 * SelectionDelegate — 选中状态委托
 *
 * 从 DataView 提取的选中状态管理职责：
 * - currentRow / selectedRows 的 getter / setter（带幂等守卫）
 * - 基于主键的 set / add / remove 系列操作（strict 模式支持）
 * - 数据加载后自动首选（autoCurrentFirst / autoSelectFirst）
 * - 无效选中状态清理（行数据刷新后同步调用）
 * - 行索引缓存管理（rowIndexMap，O(n) 构建 O(1) 查找）
 *
 * 通过 ISelectionHost 接口与宿主（DataView）交互：
 * - 仅依赖最小公共状态集合，不直接引用 DataView 类（避免循环依赖）
 * - 选中状态字段与宿主同引用，外部访问 DataView.currentRow 等字段时即可读到最新值
 */

import { Logger } from '@spark-view/spark-utils'
import type { IDataRow } from '../types'
import type { ISelectionHost, EmitStateChangedFn } from './types'
import { buildPkSet, pruneInvalidSelections } from '../core/utils'

const logger = Logger('DataView:Selection')

export class SelectionDelegate {

  constructor(
    private host: ISelectionHost,
    private emitStateChanged: EmitStateChangedFn,
  ) {}

  // ─────────────────────────────────────────────
  // 内部辅助
  // ─────────────────────────────────────────────

  /** 检查宿主是否已销毁，已销毁则抛出 */
  private checkDestroyed(): void {
    if (this.host.isDestroyed()) {
      throw new Error(`DataView ${this.host.tableName}:${this.host.viewId} has been destroyed`)
    }
  }

  /** 构建 pk → row 映射（O(n)），供 setSelectedRowsById / addSelectedRowsById 共用 */
  private buildIdToRowMap(): Map<string | number, IDataRow> {
    const m = new Map<string | number, IDataRow>()
    for (const row of this.host.rows) {
      const pk = this.host.getPrimaryKeyValue(row)
      if (pk !== undefined) m.set(pk, row)
    }
    return m
  }

  // ─────────────────────────────────────────────
  // 自动首选（数据加载后应用）
  // ─────────────────────────────────────────────

  /**
   * 数据加载完成后应用 autoCurrentFirst / autoSelectFirst 逻辑。
   *
   * updateFromServer() 替换了全部行引用，旧的 currentRow/selectedRows 指针已失效。
   * 先强制清零（无事件），再通过正式 setter 写入新值；setter 发射 stateChanged 事件，
   * DataSet.onAnyViewChange 订阅者（如 useRuleBinding）因此能正确收到事件。
   */
  applyAutoFirst(): void {
    const host = this.host
    const prevHadCurrent = host._currentRowId !== null
    const prevHadSelected = host._selectedRowIds.length > 0
    host._currentRowId = null
    host._selectedRowIds.splice(0, host._selectedRowIds.length)

    const firstRow = host.rows[0] ?? null

    if (host.autoCurrentFirst !== false && firstRow) {
      this.setCurrentRow(firstRow, { skipSync: true })
    } else if (prevHadCurrent) {
      this.emitStateChanged('currentRow', { row: null })
    }
    if (host.autoSelectFirst !== false && firstRow) {
      this.setSelectedRows([firstRow])
    } else if (prevHadSelected) {
      this.emitStateChanged('selectedRows', { rows: [] })
    }
  }

  // ─────────────────────────────────────────────
  // 当前行 / 多选行 setter
  // ─────────────────────────────────────────────

  /**
   * 设置当前行
   * 状态变更 → 发射 stateChanged → UI + 子视图级联均通过 events 接收
   *
   * @param row  - 要设置的行（null 表示清空）
   * @param opts.skipSync    - 跳过 selectionFollowsCurrent 同步（applyAutoFirst 内部用）
   * @param opts.originatorId - UI 操作来源实例 ID（由 createTableSyncHandlers 注入）；
   *                            useRuleBinding 用此字段识别"自己发出的事件"并跳过回写，
   *                            其他同级 binding 实例仍正常同步。
   */
  setCurrentRow(row: IDataRow | null, opts?: { skipSync?: boolean; originatorId?: string }): void {
    const host = this.host
    const newId = row !== null ? (host.getPrimaryKeyValue(row) ?? null) : null

    // 幂等守卫：主键相同则不触发事件
    if (newId === host._currentRowId) return
    if (row !== null && newId === null) {
      logger.warn('setCurrentRow: 行缺少主键，无法存储', { tableName: host.tableName, viewId: host.viewId })
      return
    }

    host._currentRowId = newId

    // event row 从 getter 解析（此时 _currentRowId 已更新，getter 返回正确对象）
    this.emitStateChanged('currentRow', {
      row: host.currentRow,
      ...(opts?.originatorId !== undefined ? { originatorId: opts.originatorId } : {}),
    })

    if (!opts?.skipSync && host.selectionFollowsCurrent) {
      this.setSelectedRows(row !== null ? [row] : [], opts?.originatorId)
    }
  }

  /**
   * 设置多选行（幂等：内容不变时跳过）
   *
   * @param rows         - 要设置的行数组
   * @param originatorId - UI 操作来源实例 ID（可选，同 setCurrentRow）
   */
  setSelectedRows(rows: IDataRow[], originatorId?: string): void {
    const host = this.host
    if (!Array.isArray(rows)) {
      logger.warn('setSelectedRows 收到非数组参数', { rows, tableName: host.tableName, viewId: host.viewId })
      return
    }

    // 提取 PK，过滤掉无 PK 的行
    const newIds: Array<string | number> = []
    for (const r of rows) {
      const pk = host.getPrimaryKeyValue(r)
      if (pk !== undefined) newIds.push(pk)
    }

    // 幂等守卫：PK 序列相同则不触发事件
    const oldIds = host._selectedRowIds
    if (oldIds.length === newIds.length && oldIds.every((id, i) => id === newIds[i])) return

    host._selectedRowIds.splice(0, host._selectedRowIds.length, ...newIds)

    // event rows 从 getter 解析（保证与 _selectedRowIds 同步）
    this.emitStateChanged('selectedRows', {
      rows: host.selectedRows,
      ...(originatorId !== undefined ? { originatorId } : {}),
    })
  }

  // ─────────────────────────────────────────────
  // 按主键操作
  // ─────────────────────────────────────────────

  /**
   * 根据主键设置当前行
   *
   * @param id - 主键值
   * @returns 是否成功（行不存在时返回 false）
   */
  setCurrentRowById(id: string | number): boolean {
    this.checkDestroyed()
    const host = this.host

    const row = host.rows.find(r => host.getPrimaryKeyValue(r) === id)

    if (!row) {
      logger.warn('setCurrentRowById: 行不存在', {
        tableName: host.tableName,
        viewId: host.viewId,
        primaryKey: host.primaryKey,
        id,
        totalRows: host.rows.length
      })
      return false
    }

    this.setCurrentRow(row)
    return true
  }

  /**
   * 根据主键数组设置多选行
   *
   * @param ids - 主键值数组
   * @param context - 事件上下文（可选）
   * @param options.strict - 严格模式：任何 ID 找不到则抛错（默认 false）
   * @returns 成功找到的行数
   */
  setSelectedRowsById(
    ids: Array<string | number>,
    options?: { strict?: boolean }
  ): number {
    this.checkDestroyed()
    const host = this.host

    if (!Array.isArray(ids)) {
      logger.warn('setSelectedRowsById 收到非数组参数', { ids, tableName: host.tableName, viewId: host.viewId })
      return 0
    }

    if (ids.length === 0) {
      this.setSelectedRows([])
      return 0
    }

    const idToRow = this.buildIdToRowMap()
    const foundRows: IDataRow[] = []
    const notFoundIds: Array<string | number> = []

    for (const id of ids) {
      const row = idToRow.get(id)
      if (row) {
        foundRows.push(row)
      } else {
        notFoundIds.push(id)
      }
    }

    if (options?.strict && notFoundIds.length > 0) {
      const error = new Error(
        `setSelectedRowsById (strict): 有 ${notFoundIds.length} 个 ID 找不到对应行`
      )
      logger.error('setSelectedRowsById: 严格模式下有 ID 找不到', {
        tableName: host.tableName,
        viewId: host.viewId,
        primaryKey: host.primaryKey,
        notFoundIds,
        totalRows: host.rows.length
      })
      throw error
    }

    if (notFoundIds.length > 0) {
      logger.warn('setSelectedRowsById: 部分 ID 找不到对应行', {
        tableName: host.tableName,
        viewId: host.viewId,
        primaryKey: host.primaryKey,
        notFoundIds,
        foundCount: foundRows.length,
        totalRows: host.rows.length
      })
    }

    this.setSelectedRows(foundRows)
    return foundRows.length
  }

  /**
   * 清空选中行
   */
  clearSelectedRows(): void {
    this.setSelectedRows([])
  }

  /**
   * 添加行到选中集（去重）
   *
   * @returns 实际添加的行数
   */
  addSelectedRows(rows: IDataRow[]): number {
    this.checkDestroyed()
    const host = this.host

    if (!Array.isArray(rows)) {
      logger.warn('addSelectedRows 收到非数组参数', { rows, tableName: host.tableName, viewId: host.viewId })
      return 0
    }
    if (rows.length === 0) return 0

    const selectedSet = new Set(host._selectedRowIds)
    const toAddIds: Array<string | number> = []
    for (const r of rows) {
      const pk = host.getPrimaryKeyValue(r)
      if (pk !== undefined && !selectedSet.has(pk)) toAddIds.push(pk)
    }
    if (toAddIds.length === 0) return 0

    host._selectedRowIds.push(...toAddIds)
    this.emitStateChanged('selectedRows', { rows: host.selectedRows })
    return toAddIds.length
  }

  /**
   * 从选中集移除行
   *
   * @returns 实际移除的行数
   */
  removeSelectedRows(rows: IDataRow[]): number {
    this.checkDestroyed()
    const host = this.host

    if (!Array.isArray(rows)) {
      logger.warn('removeSelectedRows 收到非数组参数', { rows, tableName: host.tableName, viewId: host.viewId })
      return 0
    }
    if (rows.length === 0 || host._selectedRowIds.length === 0) return 0

    const toRemoveSet = new Set<string | number>()
    for (const r of rows) {
      const pk = host.getPrimaryKeyValue(r)
      if (pk !== undefined) toRemoveSet.add(pk)
    }
    if (toRemoveSet.size === 0) return 0

    const newIds = host._selectedRowIds.filter(id => !toRemoveSet.has(id))
    const removedCount = host._selectedRowIds.length - newIds.length
    if (removedCount > 0) {
      host._selectedRowIds.splice(0, host._selectedRowIds.length, ...newIds)
      this.emitStateChanged('selectedRows', { rows: host.selectedRows })
    }
    return removedCount
  }

  /**
   * 根据主键数组添加选中行
   *
   * @param options.strict - 严格模式：任何 ID 找不到则抛错
   * @returns 实际添加的行数
   */
  addSelectedRowsById(
    ids: Array<string | number>,
    options?: { strict?: boolean }
  ): number {
    this.checkDestroyed()
    const host = this.host

    if (!Array.isArray(ids)) {
      logger.warn('addSelectedRowsById 收到非数组参数', { ids, tableName: host.tableName, viewId: host.viewId })
      return 0
    }
    if (ids.length === 0) return 0

    const idToRow = this.buildIdToRowMap()
    const selectedSet = new Set(host._selectedRowIds)
    const toAddIds: Array<string | number> = []
    const notFoundIds: Array<string | number> = []

    for (const id of ids) {
      if (selectedSet.has(id)) continue
      if (idToRow.has(id)) {
        toAddIds.push(id)
      } else {
        notFoundIds.push(id)
      }
    }

    if (options?.strict && notFoundIds.length > 0) {
      throw new Error(`addSelectedRowsById (strict): 有 ${notFoundIds.length} 个 ID 找不到对应行`)
    }
    if (notFoundIds.length > 0) {
      logger.warn('addSelectedRowsById: 部分 ID 找不到对应行', {
        tableName: host.tableName, viewId: host.viewId, notFoundIds, foundCount: toAddIds.length,
      })
    }
    if (toAddIds.length === 0) return 0

    host._selectedRowIds.push(...toAddIds)
    this.emitStateChanged('selectedRows', { rows: host.selectedRows })
    return toAddIds.length
  }

  /**
   * 根据主键数组移除选中行
   *
   * @returns 实际移除的行数
   */
  removeSelectedRowsById(ids: Array<string | number>): number {
    this.checkDestroyed()
    const host = this.host

    if (!Array.isArray(ids)) {
      logger.warn('removeSelectedRowsById 收到非数组参数', { ids, tableName: host.tableName, viewId: host.viewId })
      return 0
    }
    if (ids.length === 0 || host._selectedRowIds.length === 0) return 0

    const toRemoveSet = new Set(ids)
    const newIds = host._selectedRowIds.filter(id => !toRemoveSet.has(id))
    const removedCount = host._selectedRowIds.length - newIds.length
    if (removedCount > 0) {
      host._selectedRowIds.splice(0, host._selectedRowIds.length, ...newIds)
      this.emitStateChanged('selectedRows', { rows: host.selectedRows })
    }
    return removedCount
  }

  // ─────────────────────────────────────────────
  // 状态清理
  // ─────────────────────────────────────────────

  /**
   * 清理已不在 rows 中的选中状态
   *
   * 在 rows 被部分刷新（非整体替换）时调用，同步清理失效的指针。
   * @returns 是否发生了清理
   */
  cleanupInvalidSelections(): boolean {
    const host = this.host
    const rowPkSet = buildPkSet(host.rows, r => host.getPrimaryKeyValue(r))
    const { currentRowPruned, selectedRowsPruned } = pruneInvalidSelections(host, rowPkSet)

    if (currentRowPruned) {
      this.emitStateChanged('currentRow', { row: null })
    }
    if (selectedRowsPruned) {
      this.emitStateChanged('selectedRows', { rows: host.selectedRows })
    }

    return currentRowPruned || selectedRowsPruned
  }
}
