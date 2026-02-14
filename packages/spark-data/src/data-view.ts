/**
 * DataView — 数据视图（UI 状态容器）
 *
 * 直接实现类，不再继承复杂接口。
 * 管理数据展示状态、选中状态、分页状态等UI相关状态。
 */

import type { IDataRow, IViewMetadata, FilterExpression, SortExpression } from './types'
import type { TreeManager } from './tree-manager'
import { Logger } from '@spark-view/spark-utils'
import { isSameRow } from './core/utils'

// 前向声明，避免循环依赖
// DataView 只需要 emit 能力，彻底解耦关系引擎和订阅管理
interface IDataSetEmitter {
  emit(event: string, data: unknown): void
}

export class DataView {
  // ===== 属性定义 =====

  /** 表名 */
  tableName: string

  /** 数据视图ID */
  contextId: string | "default"

  // ===== 数据状态 =====

  /** 当前显示的数据行 */
  rows: IDataRow[] = []

  /** 原始数据行（用于过滤和排序的基础数据） */
  originalRows?: IDataRow[]

  /** 当前选中行 */
  currentRow: IDataRow | null = null

  /** 当前选中行索引 */
  currentRowIndex: number | null = null

  /** 选中的多行数据 */
  selectedRows: IDataRow[] = []

  /** 选中的行索引数组 */
  selectedRowIndices: number[] = []

  // ===== 分页状态 =====

  /** 总记录数 */
  total: number = 0

  /** 当前页码 */
  page: number = 1

  /** 每页大小 */
  pageSize: number = 20

  // ===== 加载状态 =====

  /** 是否正在加载 */
  isLoading: boolean = false

  /** 加载错误信息 */
  loadingError: Error | null = null

  // ===== 视图配置 =====

  /** 过滤表达式 */
  filterExpression?: FilterExpression

  /** 排序表达式 */
  sortExpression?: SortExpression

  /** 是否自动选择第一行 */
  autoSelectFirst?: boolean

  // ===== 关联对象 =====

  /** 关联的数据集事件发射器 */
  protected dataSet?: IDataSetEmitter

  /** 树形数据管理器 */
  treeManager?: TreeManager

  /** 日志记录器 */
  protected logger = Logger('DataView')

  // ===== 构造函数 =====

  /**
   * 创建数据视图实例
   * @param tableName 表名
   * @param contextId 数据视图ID
   * @param dataSet 关联的数据集
   */
  constructor(tableName: string, contextId: string | "default" = 'default', dataSet?: IDataSetEmitter) {
    this.tableName = tableName
    this.contextId = contextId
    if (dataSet !== undefined) this.dataSet = dataSet
  }

  // ===== 树管理器管理 =====

  /**
   * 设置树形数据管理器
   * @param tm 树管理器实例
   */
  setTreeManager(tm: TreeManager): void {
    this.treeManager = tm
    if (typeof tm.setDataView === 'function') tm.setDataView(this)
  }

  /**
   * 获取树形数据管理器
   * @returns 树管理器实例
   */
  getTreeManager(): TreeManager | undefined {
    return this.treeManager
  }

  // ===== 加载状态管理 =====

  /**
   * 设置加载状态
   */
  setLoading(): void {
    this.isLoading = true
    this.loadingError = null
  }

  /**
   * 设置就绪状态
   */
  setReady(): void {
    this.isLoading = false
    this.loadingError = null
  }

  /**
   * 设置错误状态
   * @param e 错误对象
   */
  setError(e: Error): void {
    this.isLoading = false
    this.loadingError = e
  }

  // ===== 选中状态管理 =====

  /**
   * 设置当前选中行
   * @param row 当前行数据
   * @param skipNotify 是否跳过通知
   */
  setCurrentRow(row: IDataRow | null, skipNotify = false): void {
    if (this.currentRow === row) return

    this.currentRow = row
    this.currentRowIndex = row === null ? null : this.rows.indexOf(row)
    if (this.currentRowIndex === -1) this.currentRowIndex = null

    if (!skipNotify && this.dataSet) {
      this.dataSet.emit('view:stateChanged', {
        tableName: this.tableName, contextId: this.contextId,
        changeType: 'currentRow', row
      })
    }
  }

  /**
   * 设置选中的多行数据
   * @param rows 选中的行数据数组
   * @param skipNotify 是否跳过订阅通知（关系级联始终执行）
   */
  setSelectedRows(rows: IDataRow[], skipNotify = false): void {
    const cur = this.selectedRows
    if (cur.length === rows.length && cur.every((r, i) => r === rows[i])) return

    this.selectedRows = rows
    this.selectedRowIndices = rows.map(r => this.rows.indexOf(r)).filter(i => i !== -1)

    // 选择行变化始终发射事件（关系级联必须执行），skipNotify 仅控制通知和广播
    if (this.dataSet) {
      this.dataSet.emit('view:stateChanged', {
        tableName: this.tableName, contextId: this.contextId,
        changeType: 'selectedRows', rows, skipNotify
      })
    }
  }

  // ===== 数据清理 =====

  /**
   * 清空所有状态
   * @param skipNotify 是否跳过通知
   */
  clearAll(skipNotify = false): void {
    const had = this.rows.length > 0 || this.currentRow !== null || this.selectedRows.length > 0
    this.rows.splice(0, this.rows.length)
    this.currentRow = null
    this.currentRowIndex = null
    this.selectedRows.splice(0, this.selectedRows.length)
    this.selectedRowIndices = []

    if (!skipNotify && had && this.dataSet) {
      this.dataSet.emit('view:stateChanged', {
        tableName: this.tableName, contextId: this.contextId,
        changeType: 'cleared'
      })
    }
  }

  /**
   * 清理无效的选中状态
   * @returns 是否有清理操作
   */
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

  /**
   * 序列化为元数据对象
   * @returns 视图元数据
   */
  toData(): IViewMetadata {
    const result: IViewMetadata = {
      tableName: this.tableName,
      contextId: this.contextId,
      page: this.page,
      pageSize: this.pageSize,
      rows: this.rows,
      filterExpression: this.filterExpression,
      sortExpression: this.sortExpression,
      autoSelectFirst: this.autoSelectFirst,
    }

    return result
  }

  // ===== 工厂方法 =====

  /**
   * 从元数据创建数据视图实例
   * @param data 视图元数据
   * @param tableName 表名
   * @param contextId 数据视图ID
   * @param dataSet 关联的数据集
   * @returns 数据视图实例
   */
  static fromData(data: IViewMetadata, tableName: string, contextId: string, dataSet?: IDataSetEmitter): DataView {
    const v = new DataView(tableName, contextId, dataSet)
    if (data.filterExpression !== undefined) v.filterExpression = data.filterExpression
    if (data.sortExpression !== undefined) v.sortExpression = data.sortExpression
    if (data.autoSelectFirst !== undefined) v.autoSelectFirst = data.autoSelectFirst
    v.page = data.page ?? 1
    v.pageSize = data.pageSize ?? 20
    return v
  }
}
