/**
 * BindingContext 类 - 上下文绑定
 * 负责：选中状态管理、数据视图、通知机制
 * 相当于 .NET 的 DataView - 视图层
 */

import type { DataRow, IBindingContext, FilterExpression, SortExpression, ITreeManager } from './types'
import { FilterExpressionParser } from './filterExpressionParser'

/**
 * DataSet 接口（前向声明，避免循环依赖）
 */
interface IDataSet {
  updateRelatedTables(tableName: string, contextId: string): void
  notifySubscribers(tableName: string, contextId: string): void
  emit(event: string, data: unknown): void
}

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
  autoSelectFirst?: boolean  // 自动选中第一行
  autoDeselectOnEmpty?: boolean  // 数据清空时自动取消选中
  
  // 分页状态
  pagination?: {
    pageIndex?: number
    pageSize?: number
    total?: number
    totalPages?: number
  }
  
  // DataSet 引用（用于触发通知）
  protected dataSet?: IDataSet
  
  // TreeManager 引用（用于树形数据管理）
  treeManager?: ITreeManager

  constructor(
    hostTable: string,
    contextId: string = 'default',
    dataSet?: IDataSet
  ) {
    this._hostTable = hostTable
    this._contextId = contextId
    this.dataSet = dataSet
  }
  
  /**
   * 设置 DataSet 引用
   */
  setDataSet(dataSet: IDataSet): void {
    this.dataSet = dataSet
  }
  
  /**
   * 设置 TreeManager 引用
   */
  setTreeManager(treeManager: ITreeManager): void {
    this.treeManager = treeManager
    // 双向绑定
    if (treeManager && typeof treeManager.setBindingContext === 'function') {
      treeManager.setBindingContext(this)
    }
  }
  
  /**
   * 获取 TreeManager 引用
   */
  getTreeManager(): ITreeManager | undefined {
    return this.treeManager
  }

  /**
   * 设置当前选中行
   */
  setCurrentRow(row: DataRow | null, skipNotify: boolean = false): void {
    // 防重复检查 - 只比较引用
    const existingRow = this.currentRow
    const isSameRow = existingRow === row
    
    if (isSameRow) {
      console.info(`⏭️ [Context] ${this._hostTable}.${this._contextId}.currentRow 未变化`)
      return
    }
    
    console.info(`🔄 [Context] ${this._hostTable}.${this._contextId}.currentRow 更新`, { from: existingRow, to: row })
    this.currentRow = row
    
    if (!skipNotify && this.dataSet) {
      // 触发关系更新
      this.dataSet.updateRelatedTables(this._hostTable, this._contextId)
      
      // 通知订阅者
      this.dataSet.notifySubscribers(this._hostTable, this._contextId)
      
      // 触发事件
      this.dataSet.emit('currentRowChanged', { 
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
    // 防重复检查：只比较引用
    const existingRows = this.selectedRows || []
    const isSameSelection = (
      existingRows.length === rows.length &&
      existingRows.every((existingRow, index) => existingRow === rows[index])
    )
    
    if (isSameSelection) {
      console.info(`⏭️ [Context] ${this._hostTable}.${this._contextId}.selectedRows 未变化`)
      return
    }
    
    console.info(`🔄 [Context] ${this._hostTable}.${this._contextId}.selectedRows 更新`, { 
      from: existingRows.length, 
      to: rows.length 
    })
    this.selectedRows = rows
    
    if (this.dataSet) {
      // ✅ 始终触发关系更新（过滤子表）
      this.dataSet.updateRelatedTables(this._hostTable, this._contextId)
      
      // ❓ 根据 skipNotify 决定是否通知当前表的订阅者
      if (!skipNotify) {
        this.dataSet.notifySubscribers(this._hostTable, this._contextId)
        
        // 🔔 仅在非 skipNotify 时触发事件（避免 UI→数据→UI 循环）
        this.dataSet.emit('selectedRowsChanged', { 
          tableName: this._hostTable, 
          contextId: this._contextId, 
          rows 
        })
      }
    }
  }

  /**
   * 手动触发通知
   */
  notifyChange(): void {
    if (this.dataSet) {
      this.dataSet.notifySubscribers(this._hostTable, this._contextId)
    }
  }

  /**
   * 清空所有状态（用于条件不满足时递归清空）
   */
  clearAll(skipNotify: boolean = false): void {
    const hadData = this.rows.length > 0 || this.currentRow !== null || this.selectedRows.length > 0;
    
    // ✅ 使用 splice 保持 Vue 响应式引用
    this.rows.splice(0, this.rows.length);
    this.currentRow = null;
    this.selectedRows.splice(0, this.selectedRows.length);
    // 注意：不清空 _originalRows，保留缓存数据
    
    if (hadData) {
      console.info(`🧹 [Context] ${this._hostTable}.${this._contextId} 已清空所有状态`);
    }
    
    if (!skipNotify && hadData && this.dataSet) {
      this.dataSet.notifySubscribers(this._hostTable, this._contextId);
      // 触发清空事件
      this.dataSet.emit('contextCleared', { tableName: this._hostTable, contextId: this._contextId });
    }
  }

  /**
   * 应用排序表达式
   */
  private applySorting(rows: DataRow[], sortExpression: SortExpression): DataRow[] {
    // 创建副本以避免修改原数组
    const sorted = [...rows];
    
    // 判断是单字段还是多字段排序
    if ('field' in sortExpression) {
      // 单字段排序
      const { field, direction } = sortExpression;
      return this.sortByField(sorted, field, direction);
    } else if ('fields' in sortExpression) {
      // 多字段排序
      return this.sortByFields(sorted, sortExpression.fields);
    }
    
    return sorted;
  }

  /**
   * 单字段排序
   */
  private sortByField(rows: DataRow[], field: string, direction: string): DataRow[] {
    const isAsc = direction.toLowerCase() === 'asc';
    
    return rows.sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      
      // 处理 null/undefined
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return isAsc ? 1 : -1;
      if (bVal === null) return isAsc ? -1 : 1;
      
      // 数值比较
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return isAsc ? aVal - bVal : bVal - aVal;
      }
      
      // 字符串比较
      const aStr = String(aVal);
      const bStr = String(bVal);
      const compareResult = aStr.localeCompare(bStr, 'zh-CN');
      
      return isAsc ? compareResult : -compareResult;
    });
  }

  /**
   * 多字段排序
   */
  private sortByFields(rows: DataRow[], fields: Array<{ field: string; direction: string }>): DataRow[] {
    return rows.sort((a, b) => {
      for (const { field, direction } of fields) {
        const isAsc = direction.toLowerCase() === 'asc';
        const aVal = a[field];
        const bVal = b[field];
        
        // 处理 null/undefined
        if (aVal === null && bVal === null) continue;
        if (aVal === null) return isAsc ? 1 : -1;
        if (bVal === null) return isAsc ? -1 : 1;
        
        // 数值比较
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          const diff = aVal - bVal;
          if (diff !== 0) return isAsc ? diff : -diff;
          continue;
        }
        
        // 字符串比较
        const aStr = String(aVal);
        const bStr = String(bVal);
        const compareResult = aStr.localeCompare(bStr, 'zh-CN');
        
        if (compareResult !== 0) {
          return isAsc ? compareResult : -compareResult;
        }
      }
      
      return 0; // 所有字段都相等
    });
  }

  /**
   * 更新上下文的 rows（应用过滤和排序）
   * @param sourceData 完整数据源（通常是 table._originalRows 或 table.rows）
   */
  updateRows(sourceData: DataRow[]): void {
    let result = [...sourceData];
    
    // 1. 执行过滤
    if (this.filterExpression) {
      try {
        const filterFn = FilterExpressionParser.toMemoryFilter(this.filterExpression);
        result = result.filter(filterFn);
      } catch (e) {
        console.error(`❌ [Context] ${this._hostTable}.${this._contextId} 过滤失败:`, e);
        result = [];
      }
    }
    
    // 2. 执行排序
    if (this.sortExpression) {
      try {
        result = this.applySorting(result, this.sortExpression);
      } catch (e) {
        console.error(`❌ [Context] ${this._hostTable}.${this._contextId} 排序失败:`, e);
      }
    }
    
    this.rows = result;
  }

  /**
   * 刷新上下文（重新应用过滤和排序）
   * @param sourceData 完整数据源
   */
  refresh(sourceData: DataRow[]): void {
    this.updateRows(sourceData);
    console.info(`✅ [Refresh] 上下文 ${this._contextId} 已刷新，当前 ${this.rows.length} 行`);
  }

  /**
   * 清理无效的选中状态
   * 检查 currentRow 和 selectedRows 是否还在当前上下文的 rows 中
   * @returns 是否发生了清理操作
   */
  cleanupInvalidSelections(): boolean {
    const contextRows = this.rows || [];
    let needsCleanup = false;
    
    // 检查 currentRow
    if (this.currentRow) {
      const currentRowExists = contextRows.some(row => 
        JSON.stringify(row) === JSON.stringify(this.currentRow)
      );
      
      if (!currentRowExists) {
        console.info(`🧹 [Cleanup] ${this._hostTable}.${this._contextId}.currentRow 不在上下文数据中，清空`);
        this.currentRow = null;
        needsCleanup = true;
      }
    }
    
    // 检查 selectedRows
    if (this.selectedRows && this.selectedRows.length > 0) {
      const validSelectedRows = this.selectedRows.filter(selectedRow => {
        const selectedRowStr = JSON.stringify(selectedRow)
        return contextRows.some(row => JSON.stringify(row) === selectedRowStr)
      });
      
      if (validSelectedRows.length !== this.selectedRows.length) {
        console.info(`🧹 [Cleanup] ${this._hostTable}.${this._contextId}.selectedRows 清理: ${this.selectedRows.length} -> ${validSelectedRows.length}`);
        this.selectedRows = validSelectedRows;
        needsCleanup = true;
      }
    }
    
    return needsCleanup;
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
  static fromJSON(data: Partial<IBindingContext>, hostTable: string, contextId: string, dataSet?: IDataSet): BindingContext {
    const context = new BindingContext(hostTable, contextId, dataSet)
    
    context.currentRow = data.currentRow ?? null
    context.selectedRows = data.selectedRows ?? []
    context.rows = data.rows ?? []
    context._originalRows = data._originalRows
    context.filterExpression = data.filterExpression
    context.sortExpression = data.sortExpression
    context.pagination = data.pagination
    
    return context
  }
}
