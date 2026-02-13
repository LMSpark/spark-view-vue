/**
 * DataView — 数据视图（UI 状态容器）
 *
 * 定位：UI 和后端之间的薄状态层
 * - 持有：rows、选中状态、分页、加载标记
 * - 不做：排序、过滤、网络请求、重试、性能监控
 */

import type {
  IDataRowWithPermission, IDataView, IViewMetadata,
  IDataSet, FilterExpression, SortExpression, ITreeManager
} from './types'
import { Logger } from '@spark-view/spark-utils'
import { isSameRow } from './core/utils'

export class DataView implements IDataView {
  // ===== 数据状态 =====
  rows: IDataRowWithPermission[] = []
  originalRows?: IDataRowWithPermission[]
  currentRow: IDataRowWithPermission | null = null
  currentRowIndex: number | null = null
  selectedRows: IDataRowWithPermission[] = []
  selectedRowIndices: number[] = []

  // ===== 分页 =====
  total: number = 0
  page: number = 1
  pageSize: number = 20

  // ===== 加载状态 =====
  isLoading = false
  loadingError: Error | null = null

  // ===== 配置 =====
  filterExpression?: FilterExpression
  sortExpression?: SortExpression
  autoSelectFirst?: boolean

  // ===== 引用 =====
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

  // ===== 访问器 =====
  get hostTable() { return this.__hostTable }
  get contextId() { return this.__contextId }

  setDataSet(ds: IDataSet) { this.dataSet = ds }
  setTreeManager(tm: ITreeManager) {
    this.treeManager = tm
    if (typeof tm.setDataView === 'function') tm.setDataView(this)
  }
  getTreeManager() { return this.treeManager }

  // ===== 加载状态（供 DataLoader 调用） =====
  setLoading() { this.isLoading = true; this.loadingError = null }
  setReady()   { this.isLoading = false; this.loadingError = null }
  setError(e: Error) { this.isLoading = false; this.loadingError = e }

  // ===== 选中管理 =====

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

  // ===== 序列化 =====

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
