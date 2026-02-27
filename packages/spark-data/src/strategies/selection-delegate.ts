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
import type { IDataRow, EventSource } from '../types'
import { createEventContext } from '../core/event-id'
import type { ISelectionHost, EmitStateChangedFn } from './types'

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

  /** 构建 row → index 映射（O(n)），供 setSelectedRows / cleanupInvalidSelections 复用 */
  private buildRowIndexMap(rows: IDataRow[]): Map<IDataRow, number> {
    const m = new Map<IDataRow, number>()
    let i = 0
    for (const row of rows) m.set(row, i++)
    return m
  }

  /** 将行数组映射为索引数组（单次遍历，无 -1 占位，替代 .map(get ?? -1).filter(≠-1)）*/
  private mapRowsToIndices(rows: IDataRow[], map: Map<IDataRow, number>): number[] {
    const result: number[] = []
    for (const r of rows) {
      const idx = map.get(r)
      if (idx !== undefined) result.push(idx)
    }
    return result
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
    const prevCurrentRow = host.currentRow
    const prevHadSelected = host.selectedRows.length > 0
    host.currentRow = null
    host.currentRowIndex = null
    host.selectedRows.splice(0, host.selectedRows.length)
    host.selectedRowIndices = []
    // rowIndexMap 已由 updateFromServer() 清零（updateFromServer 总在本方法之前被调用），无需重复清零

    const firstRow = host.rows[0] ?? null
    // 每次调用各自创建独立 eventId：currentRow 与 selectedRows 是两个独立的状态变更事件
    const mkAutoCtx = () => createEventContext('auto', { tableName: host.tableName, viewId: host.viewId })

    if (host.autoCurrentFirst !== false && firstRow) {
      // skipSync=true：autoSelectFirst 由下方独立控制，不走 selectionFollowsCurrent 联动
      this.setCurrentRow(firstRow, 'auto', { skipSync: true })
    } else if (prevCurrentRow !== null) {
      // autoCurrentFirst=false 或无数据：直接 emit，生成独立 eventId
      this.emitStateChanged('currentRow', { row: null, context: mkAutoCtx() })
    }
    if (host.autoSelectFirst !== false && firstRow) {
      this.setSelectedRows([firstRow], 'auto')
    } else if (prevHadSelected) {
      // autoSelectFirst=false 或无数据：直接 emit，生成独立 eventId
      this.emitStateChanged('selectedRows', { rows: [], context: mkAutoCtx() })
    }
  }

  // ─────────────────────────────────────────────
  // 当前行 / 多选行 setter
  // ─────────────────────────────────────────────

  /**
   * 设置当前行
   * 状态变更 → 发射 stateChanged → UI + 子视图级联均通过 events 接收
   *
   * @param row    - 要设置的行（null 表示清空）
   * @param source - 事件来源标签（默认 'program'）。
   *                 eventId 始终在内部独立生成，调用方不能也不应控制事件的唯一标识。
   * @param opts.skipSync - 跳过 selectionFollowsCurrent 同步（applyAutoFirst 内部用，
   *                        避免干扰 autoSelectFirst 独立配置）
   */
  setCurrentRow(row: IDataRow | null, source?: EventSource, opts?: { skipSync?: boolean }): void {
    const host = this.host
    if (host.currentRow === row) return

    host.currentRow = row
    // rowIndexMap 已构建时 O(1) 查找，未构建时回退到 O(n) indexOf
    host.currentRowIndex = row === null
      ? null
      : (host.rowIndexMap?.get(row) ?? host.rows.indexOf(row))
    if (host.currentRowIndex === -1) host.currentRowIndex = null

    // 每次 emit 独立生成 eventId，source 仅作来源标签
    const ctx = createEventContext(source ?? 'program', { tableName: host.tableName, viewId: host.viewId })
    this.emitStateChanged('currentRow', { row, context: ctx })

    // selectionFollowsCurrent 副作用：传 source 不传 ctx，setSelectedRows 内部生成自己的 eventId
    // applyAutoFirst 传入 skipSync=true，selectedRows 由 autoSelectFirst 独立控制
    if (!opts?.skipSync && host.selectionFollowsCurrent) {
      this.setSelectedRows(row !== null ? [row] : [], source)
    }
  }

  /**
   * 设置多选行（幂等：内容不变时跳过）
   *
   * @param rows   - 要设置的行数组
   * @param source - 事件来源标签（默认 'program'）。
   *                 eventId 始终在内部独立生成，调用方不能也不应控制事件的唯一标识。
   */
  setSelectedRows(rows: IDataRow[], source?: EventSource): void {
    const host = this.host
    // 防御性检查，确保 rows 是有效数组（el-table 事件可能传入非数组）
    if (!Array.isArray(rows)) {
      logger.warn('setSelectedRows 收到非数组参数', { rows, tableName: host.tableName, viewId: host.viewId })
      return
    }

    const cur = host.selectedRows
    if (cur.length === rows.length && cur.every((r, i) => r === rows[i])) return

    host.selectedRows.splice(0, host.selectedRows.length, ...rows)

    // 使用 Map 加速索引查找（O(n) 而非 O(n²)）
    const rowMap = host.rowIndexMap ??= this.buildRowIndexMap(host.rows)
    host.selectedRowIndices = this.mapRowsToIndices(rows, rowMap)

    // 每次 emit 独立生成 eventId，source 仅作来源标签
    const ctx = createEventContext(source ?? 'program', { tableName: host.tableName, viewId: host.viewId })
    this.emitStateChanged('selectedRows', { rows: [...rows], context: ctx })
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
  setCurrentRowById(
    id: string | number,
    source?: EventSource
  ): boolean {
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

    this.setCurrentRow(row, source)
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
    source?: EventSource,
    options?: { strict?: boolean }
  ): number {
    this.checkDestroyed()
    const host = this.host

    if (!Array.isArray(ids)) {
      logger.warn('setSelectedRowsById 收到非数组参数', { ids, tableName: host.tableName, viewId: host.viewId })
      return 0
    }

    if (ids.length === 0) {
      this.setSelectedRows([], source)
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

    this.setSelectedRows(foundRows, source)
    return foundRows.length
  }

  /**
   * 清空选中行
   */
  clearSelectedRows(source?: EventSource): void {
    this.setSelectedRows([], source)
  }

  /**
   * 添加行到选中集（去重）
   *
   * @returns 实际添加的行数
   */
  addSelectedRows(
    rows: IDataRow[],
    source?: EventSource
  ): number {
    this.checkDestroyed()
    const host = this.host

    if (!Array.isArray(rows)) {
      logger.warn('addSelectedRows 收到非数组参数', { rows, tableName: host.tableName, viewId: host.viewId })
      return 0
    }

    if (rows.length === 0) return 0

    // 构建现有选中行的主键 Set（单次遍历）
    const selectedSet = new Set<string | number>()
    for (const r of host.selectedRows) {
      const pk = host.getPrimaryKeyValue(r)
      if (pk !== undefined) selectedSet.add(pk)
    }

    const toAdd = rows.filter(r => {
      const pk = host.getPrimaryKeyValue(r)
      return pk !== undefined && !selectedSet.has(pk)
    })

    if (toAdd.length === 0) return 0

    const newSelection = [...host.selectedRows, ...toAdd]
    this.setSelectedRows(newSelection, source)
    return toAdd.length
  }

  /**
   * 从选中集移除行
   *
   * @returns 实际移除的行数
   */
  removeSelectedRows(
    rows: IDataRow[],
    source?: EventSource
  ): number {
    this.checkDestroyed()
    const host = this.host

    if (!Array.isArray(rows)) {
      logger.warn('removeSelectedRows 收到非数组参数', { rows, tableName: host.tableName, viewId: host.viewId })
      return 0
    }

    if (rows.length === 0 || host.selectedRows.length === 0) return 0

    const toRemoveSet = new Set<string | number>()
    for (const r of rows) {
      const pk = host.getPrimaryKeyValue(r)
      if (pk !== undefined) toRemoveSet.add(pk)
    }

    if (toRemoveSet.size === 0) return 0

    const newSelection = host.selectedRows.filter(r => {
      const pk = host.getPrimaryKeyValue(r)
      return pk === undefined || !toRemoveSet.has(pk)
    })

    const removedCount = host.selectedRows.length - newSelection.length
    if (removedCount > 0) {
      this.setSelectedRows(newSelection, source)
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
    source?: EventSource,
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

    const selectedSet = new Set<string | number>()
    for (const r of host.selectedRows) {
      const pk = host.getPrimaryKeyValue(r)
      if (pk !== undefined) selectedSet.add(pk)
    }

    const toAdd: IDataRow[] = []
    const notFoundIds: Array<string | number> = []
    const alreadySelectedIds: Array<string | number> = []

    for (const id of ids) {
      if (selectedSet.has(id)) {
        alreadySelectedIds.push(id)
        continue
      }
      const row = idToRow.get(id)
      if (row) {
        toAdd.push(row)
      } else {
        notFoundIds.push(id)
      }
    }

    if (options?.strict && notFoundIds.length > 0) {
      const error = new Error(
        `addSelectedRowsById (strict): 有 ${notFoundIds.length} 个 ID 找不到对应行`
      )
      logger.error('addSelectedRowsById: 严格模式下有 ID 找不到', {
        tableName: host.tableName,
        viewId: host.viewId,
        primaryKey: host.primaryKey,
        notFoundIds,
        totalRows: host.rows.length
      })
      throw error
    }

    if (notFoundIds.length > 0) {
      logger.warn('addSelectedRowsById: 部分 ID 找不到对应行', {
        tableName: host.tableName,
        viewId: host.viewId,
        primaryKey: host.primaryKey,
        notFoundIds,
        foundCount: toAdd.length,
        alreadySelected: alreadySelectedIds.length,
        totalRows: host.rows.length
      })
    }

    if (toAdd.length > 0) {
      return this.addSelectedRows(toAdd, source)
    }

    return 0
  }

  /**
   * 根据主键数组移除选中行
   *
   * @returns 实际移除的行数
   */
  removeSelectedRowsById(
    ids: Array<string | number>,
    source?: EventSource
  ): number {
    this.checkDestroyed()
    const host = this.host

    if (!Array.isArray(ids)) {
      logger.warn('removeSelectedRowsById 收到非数组参数', { ids, tableName: host.tableName, viewId: host.viewId })
      return 0
    }

    if (ids.length === 0 || host.selectedRows.length === 0) return 0

    const toRemoveSet = new Set(ids)

    const newSelection = host.selectedRows.filter(r => {
      const pk = host.getPrimaryKeyValue(r)
      return pk === undefined || !toRemoveSet.has(pk)
    })

    const removedCount = host.selectedRows.length - newSelection.length
    if (removedCount > 0) {
      this.setSelectedRows(newSelection, source)
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
    let cleaned = false

    // O(n) 单次遍历构建主键 Set，避免双重遍历
    const rowPkSet = new Set<string | number>()
    for (const r of host.rows) {
      const pk = host.getPrimaryKeyValue(r)
      if (pk !== undefined) rowPkSet.add(pk)
    }

    const currentRow = host.currentRow
    if (currentRow) {
      const pk = host.getPrimaryKeyValue(currentRow)
      if (pk === undefined || !rowPkSet.has(pk)) {
        host.currentRow = null
        host.currentRowIndex = null
        cleaned = true
      }
    }

    if (host.selectedRows.length > 0) {
      const valid = host.selectedRows.filter(sr => {
        const pk = host.getPrimaryKeyValue(sr)
        return pk !== undefined && rowPkSet.has(pk)
      })
      if (valid.length !== host.selectedRows.length) {
        host.selectedRows.splice(0, host.selectedRows.length, ...valid)
        const rowMap = host.rowIndexMap ??= this.buildRowIndexMap(host.rows)
        host.selectedRowIndices = this.mapRowsToIndices(valid, rowMap)
        cleaned = true
      }
    }

    return cleaned
  }
}
