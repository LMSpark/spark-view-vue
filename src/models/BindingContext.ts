/**
 * BindingContext 类 - 上下文绑定
 * 负责：选中状态管理、数据视图、通知机制
 */

import type { DataRow, IBindingContext, FilterExpression, SortExpression } from '../types/pageData'
import type { DataSetManager } from '../utils/dataSetManager'

/**
 * 绑定上下文类（实现 IBindingContext 接口 + 方法逻辑）
 */
export class BindingContext implements IBindingContext {
  currentRow: DataRow | null = null
  selectedRows: DataRow[] = []
  rows: DataRow[] = []
  _originalRows?: DataRow[]
  
  // 宿主信息
  _hostTable: string
  _contextId: string
  
  // 初始配置
  filterExpression?: FilterExpression
  sortExpression?: SortExpression
  
  // 分页状态
  pagination?: {
    pageIndex?: number
    pageSize?: number
    total?: number
    totalPages?: number
  }
  
  // Manager 引用（用于触发通知）
  protected manager?: DataSetManager

  constructor(
    hostTable: string,
    contextId: string = 'default',
    manager?: DataSetManager
  ) {
    this._hostTable = hostTable
    this._contextId = contextId
    this.manager = manager
  }

  /**
   * 设置当前选中行
   */
  setCurrentRow(row: DataRow | null, skipNotify: boolean = false): void {
    // 防重复检查
    const existingRow = this.currentRow
    const isSameRow = (
      existingRow === row || 
      (existingRow === null && row === null) ||
      (existingRow === undefined && row === undefined) ||
      (existingRow && row && (existingRow as any).id === (row as any).id)
    )
    
    if (isSameRow) {
      console.log(`⏭️ [Context] ${this._hostTable}.${this._contextId}.currentRow 未变化`)
      return
    }
    
    console.log(`🔄 [Context] ${this._hostTable}.${this._contextId}.currentRow 更新`, { from: existingRow, to: row })
    this.currentRow = row
    
    if (!skipNotify && this.manager) {
      // 触发关系更新
      this.manager.updateRelatedTables(this._hostTable, this._contextId)
      
      // 通知订阅者
      this.manager.notifySubscribers(this._hostTable, this._contextId)
      
      // 触发事件
      this.manager.emit('currentRowChanged', { 
        tableName: this._hostTable, 
        contextId: this._contextId, 
        row 
      })
    }
  }

  /**
   * 设置选中行集合
   * @param rows 选中的行数据
   * @param skipNotify 是否跳过通知当前表的 UI 更新（但仍会触发关联更新）
   */
  setSelectedRows(rows: DataRow[], skipNotify: boolean = false): void {
    console.log(`🔄 [Context] ${this._hostTable}.${this._contextId}.selectedRows 更新`, rows)
    this.selectedRows = rows
    
    if (this.manager) {
      // ✅ 始终触发关系更新（过滤子表）
      this.manager.updateRelatedTables(this._hostTable, this._contextId)
      
      // ❓ 根据 skipNotify 决定是否通知当前表的订阅者
      if (!skipNotify) {
        this.manager.notifySubscribers(this._hostTable, this._contextId)
      }
      
      // 触发事件
      this.manager.emit('selectedRowsChanged', { 
        tableName: this._hostTable, 
        contextId: this._contextId, 
        rows 
      })
    }
  }

  /**
   * 手动触发通知
   */
  notifyChange(): void {
    if (this.manager) {
      this.manager.notifySubscribers(this._hostTable, this._contextId)
    }
  }

  /**
   * 设置 Manager 引用（用于延迟绑定）
   */
  setManager(manager: DataSetManager): void {
    this.manager = manager
  }

  /**
   * 转换为普通对象（用于序列化）
   */
  toJSON() {
    return {
      currentRow: this.currentRow,
      selectedRows: this.selectedRows,
      rows: this.rows,
      _originalRows: this._originalRows,
      _hostTable: this._hostTable,
      _contextId: this._contextId,
      filterExpression: this.filterExpression,
      sortExpression: this.sortExpression,
      pagination: this.pagination
    }
  }

  /**
   * 从普通对象创建实例
   */
  static fromJSON(data: any, hostTable: string, contextId: string, manager?: DataSetManager): BindingContext {
    const context = new BindingContext(hostTable, contextId, manager)
    
    context.currentRow = data.currentRow || null
    context.selectedRows = data.selectedRows || []
    context.rows = data.rows || []
    context._originalRows = data._originalRows
    context.filterExpression = data.filterExpression
    context.sortExpression = data.sortExpression
    context.pagination = data.pagination
    
    return context
  }
}
