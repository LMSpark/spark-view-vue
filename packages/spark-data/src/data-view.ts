/**
 * DataView — 数据视图（UI 状态容器）
 *
 * 直接实现类，不再继承复杂接口
 */

import type { IDataRow, IViewMetadata, FilterExpression, SortExpression, ITreeManager } from './types'
import { Logger } from '@spark-view/spark-utils'
import { isSameRow } from './core/utils'

// 前向声明，避免循环依赖
interface IDataSet {
  updateRelatedTables(tableName: string, contextId?: string): void
  notifySubscribers(tableName: string, contextId?: string): void
  emit(event: string, data: unknown): void
}

export class DataView {
  // 基础标识
  hostTable: string
  contextId: string | "default"

  // 数据状态
  rows: IDataRow[] = []
  originalRows?: IDataRow[]
  currentRow: IDataRow | null = null
  currentRowIndex: number | null = null
  selectedRows: IDataRow[] = []
  selectedRowIndices: number[] = []

  // 分页状态
  total: number = 0
  page: number = 1
  pageSize: number = 20

  // 加载状态
  isLoading: boolean = false
  loadingError: Error | null = null

  // 视图配置
  filterExpression?: FilterExpression
  sortExpression?: SortExpression
  autoSelectFirst?: boolean

  // 关联对象
  protected dataSet?: IDataSet
  treeManager?: ITreeManager

  protected logger = Logger('DataView')

  constructor(hostTable: string, contextId: string | "default" = 'default', dataSet?: IDataSet) {
    this.hostTable = hostTable
    this.contextId = contextId
    this.dataSet = dataSet
  }

  // 树管理器设置
  setTreeManager(tm: ITreeManager): void {
    this.treeManager = tm
    if (typeof tm.setDataView === 'function') tm.setDataView(this)
  }

  getTreeManager(): ITreeManager | undefined {
    return this.treeManager
  }

  // 加载状态管理
  setLoading(): void {
    this.isLoading = true
    this.loadingError = null
  }

  setReady(): void {
    this.isLoading = false
    this.loadingError = null
  }

  setError(e: Error): void {
    this.isLoading = false
    this.loadingError = e
  }

  // 选中管理
  setCurrentRow(row: IDataRow | null, skipNotify = false): void {
    if (this.currentRow === row) return

    this.currentRow = row
    this.currentRowIndex = row === null ? null : this.rows.indexOf(row)
    if (this.currentRowIndex === -1) this.currentRowIndex = null

    if (!skipNotify && this.dataSet) {
      this.dataSet.updateRelatedTables(this.hostTable, this.contextId)
      this.dataSet.notifySubscribers(this.hostTable, this.contextId)
      this.dataSet.emit('currentRowChanged', {
        tableName: this.hostTable, contextId: this.contextId, row
      })
    }
  }

  setSelectedRows(rows: IDataRow[], skipNotify = false): void {
    const cur = this.selectedRows
    if (cur.length === rows.length && cur.every((r, i) => r === rows[i])) return

    this.selectedRows = rows
    this.selectedRowIndices = rows.map(r => this.rows.indexOf(r)).filter(i => i !== -1)

    if (this.dataSet) {
      this.dataSet.updateRelatedTables(this.hostTable, this.contextId)
      if (!skipNotify) {
        this.dataSet.notifySubscribers(this.hostTable, this.contextId)
        this.dataSet.emit('selectedRowsChanged', {
          tableName: this.hostTable, contextId: this.contextId, rows
        })
      }
    }
  }

  // 清空所有状态
  clearAll(skipNotify = false): void {
    const had = this.rows.length > 0 || this.currentRow !== null || this.selectedRows.length > 0
    this.rows.splice(0, this.rows.length)
    this.currentRow = null
    this.currentRowIndex = null
    this.selectedRows.splice(0, this.selectedRows.length)
    this.selectedRowIndices = []

    if (!skipNotify && had && this.dataSet) {
      this.dataSet.notifySubscribers(this.hostTable, this.contextId)
      this.dataSet.emit('contextCleared', { tableName: this.hostTable, contextId: this.contextId })
    }
  }

  // 清理无效选中
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

  // 序列化
  toData(): IViewMetadata {
    return {
      hostTable: this.hostTable,
      contextId: this.contextId,
      filterExpression: this.filterExpression,
      sortExpression: this.sortExpression,
      autoSelectFirst: this.autoSelectFirst,
      page: this.page,
      pageSize: this.pageSize,
    }
  }

  // 工厂方法
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
