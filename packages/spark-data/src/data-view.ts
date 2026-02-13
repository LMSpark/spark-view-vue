/**
 * DataView — 数据视图（UI 状态容器）
 *
 * Purpose: 作为 UI 层与数据结构（DataSet/DataTable）之间的薄状态容器，
 * - 负责：持有视图行（rows）、选中/当前行状态、分页与加载标记、视图序列化
 * - 不负责：网络请求、复杂的持久化、跨表业务逻辑（由 DataSet 管理）
 *
 * Public surface:
 * - 构造与序列化：fromData / toData
 * - 状态管理：setCurrentRow / setSelectedRows / clearAll / cleanupInvalidSelections
 *
 * Usage example:
 * const dv = new DataView('Users', 'default', dataSet)
 * dv.rows = fetchedRows; dv.setSelectedRows([dv.rows[0]])
 */

import type {
  IDataRowWithPermission, IDataView, IViewMetadata,
  IDataSet, FilterExpression, SortExpression, ITreeManager
} from './types'
import { Logger } from '@spark-view/spark-utils'
import { isSameRow } from './core/utils'

export class DataView implements IDataView {
  /* ---------------------------------------------------------------------------
   * 状态（State） — 存储视图数据与选中/当前行信息
   * - rows / originalRows: 当前页面/视图的行数据
   * - currentRow / currentRowIndex: 当前焦点行
   * - selectedRows / selectedRowIndices: 选中行的缓存
   * --------------------------------------------------------------------------- */
  rows: IDataRowWithPermission[] = []
  originalRows?: IDataRowWithPermission[]
  currentRow: IDataRowWithPermission | null = null
  currentRowIndex: number | null = null
  selectedRows: IDataRowWithPermission[] = []
  selectedRowIndices: number[] = []

  /* ---------------------------------------------------------------------------
   * 分页（Paging） — 仅保存分页参数（由 DataLoader/外部负责实际分页请求）
   * - page / pageSize / total
   * --------------------------------------------------------------------------- */
  total: number = 0
  page: number = 1
  pageSize: number = 20

  /* ---------------------------------------------------------------------------
   * 加载状态（Loading） — 简要记录加载中与加载错误，供 UI 显示
   * - isLoading: 加载标记
   * - loadingError: 最近一次加载错误（若有）
   * --------------------------------------------------------------------------- */
  isLoading = false
  loadingError: Error | null = null

  /* ---------------------------------------------------------------------------
   * 视图配置（Configuration） — 持久化到 IViewMetadata 的可选设置
   * - filterExpression / sortExpression / autoSelectFirst
   * --------------------------------------------------------------------------- */
  filterExpression?: FilterExpression
  sortExpression?: SortExpression
  autoSelectFirst?: boolean

  /* ---------------------------------------------------------------------------
   * 引用（References） — 关联到宿主 DataSet 与可选 TreeManager
   * - dataSet: 用于通知/广播/跨表同步
   * - treeManager: 树形视图支持的可选关联
   * --------------------------------------------------------------------------- */
  protected dataSet?: IDataSet
  treeManager?: ITreeManager

  protected logger = Logger('DataView')

  private __hostTable: string
  private __contextId: string

  constructor(hostTable: string, contextId = 'default', dataSet?: IDataSet) {
    this.__hostTable = hostTable
    this.__contextId = contextId
    this.dataSet = dataSet
  }

  /* ---------------------------------------------------------------------------
   * 访问器（Accessors） — 公开只读属性和小型设置方法
   * - hostTable / contextId
   * - setDataSet / setTreeManager / getTreeManager
   * --------------------------------------------------------------------------- */
  get hostTable() { return this.__hostTable }
  get contextId() { return this.__contextId }

  setDataSet(ds: IDataSet) { this.dataSet = ds }
  setTreeManager(tm: ITreeManager) {
    this.treeManager = tm
    if (typeof tm.setDataView === 'function') tm.setDataView(this)
  }
  getTreeManager() { return this.treeManager }

  /* ---------------------------------------------------------------------------
   * 加载生命周期（Loading helpers） — 供 DataLoader 或上层调用以切换加载状态
   * - setLoading / setReady / setError
   * --------------------------------------------------------------------------- */
  setLoading() { this.isLoading = true; this.loadingError = null }
  setReady()   { this.isLoading = false; this.loadingError = null }
  setError(e: Error) { this.isLoading = false; this.loadingError = e }

  /* ---------------------------------------------------------------------------
   * 选中管理（Selection management） — current / selected 行的设置、清理与通知
   * - setCurrentRow / setSelectedRows / clearAll / cleanupInvalidSelections
   * - 变更会通知关联的 DataSet（updateRelatedTables / notifySubscribers / emit）
   * --------------------------------------------------------------------------- */

  setCurrentRow(row: IDataRowWithPermission | null, skipNotify = false): void {
    if (this.currentRow === row) return

    this.currentRow = row
    this.currentRowIndex = row === null ? null : this.rows.indexOf(row)
    if (this.currentRowIndex === -1) this.currentRowIndex = null

    if (!skipNotify && this.dataSet) {
      this.dataSet.updateRelatedTables(this.__hostTable, this.__contextId)
      this.dataSet.notifySubscribers(this.__hostTable, this.__contextId)
      this.dataSet.emit('currentRowChanged', {
        tableName: this.__hostTable, contextId: this.__contextId, row
      })
    }
  }

  setSelectedRows(rows: IDataRowWithPermission[], skipNotify = false): void {
    const cur = this.selectedRows
    if (cur.length === rows.length && cur.every((r, i) => r === rows[i])) return

    this.selectedRows = rows
    this.selectedRowIndices = rows.map(r => this.rows.indexOf(r)).filter(i => i !== -1)

    if (this.dataSet) {
      this.dataSet.updateRelatedTables(this.__hostTable, this.__contextId)
      if (!skipNotify) {
        this.dataSet.notifySubscribers(this.__hostTable, this.__contextId)
        this.dataSet.emit('selectedRowsChanged', {
          tableName: this.__hostTable, contextId: this.__contextId, rows
        })
      }
    }
  }

  /** 清空所有状态 */
  clearAll(skipNotify = false): void {
    const had = this.rows.length > 0 || this.currentRow !== null || this.selectedRows.length > 0
    this.rows.splice(0, this.rows.length)
    this.currentRow = null
    this.currentRowIndex = null
    this.selectedRows.splice(0, this.selectedRows.length)
    this.selectedRowIndices = []

    if (!skipNotify && had && this.dataSet) {
      this.dataSet.notifySubscribers(this.__hostTable, this.__contextId)
      this.dataSet.emit('contextCleared', { tableName: this.__hostTable, contextId: this.__contextId })
    }
  }

  /** 清理不在 rows 里的无效选中 */
  cleanupInvalidSelections(): boolean {
    let cleaned = false
    if (this.currentRow && !this.rows.some(r => isSameRow(r, this.currentRow))) {
      this.currentRow = null
      this.currentRowIndex = null
      cleaned = true
    }
    if (this.selectedRows.length > 0) {
      const valid = this.selectedRows.filter(sr => this.rows.some(r => isSameRow(r, sr)))
      if (valid.length !== this.selectedRows.length) {
        this.selectedRows = valid
        this.selectedRowIndices = valid.map(r => this.rows.indexOf(r)).filter(i => i !== -1)
        cleaned = true
      }
    }
    return cleaned
  }

  /* ---------------------------------------------------------------------------
   * 序列化（Serialization） — 将视图配置序列化为 IViewMetadata（仅配置，不包含行数据）
   * - toData / static fromData
   * --------------------------------------------------------------------------- */

  toData(): IViewMetadata {
    return {
      hostTable: this.__hostTable,
      contextId: this.__contextId,
      filterExpression: this.filterExpression,
      sortExpression: this.sortExpression,
      autoSelectFirst: this.autoSelectFirst,
      page: this.page,
      pageSize: this.pageSize,
    }
  }

  static fromData(data: IViewMetadata, hostTable: string, contextId: string, dataSet?: IDataSet): DataView {
    const v = new DataView(hostTable, contextId, dataSet)
    v.filterExpression = data.filterExpression
    v.sortExpression = data.sortExpression
    v.autoSelectFirst = data.autoSelectFirst
    v.page = data.page ?? 1
    v.pageSize = data.pageSize ?? 20
    return v
  }
}
