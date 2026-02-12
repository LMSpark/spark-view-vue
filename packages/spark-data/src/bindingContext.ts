/**
 * DataView 类 - 数据视图
 * 负责：选中状态管理、数据视图、通知机制
 * 相当于 .NET 的 DataView - 视图层
 */

import type { IDataRow, IDataRowWithPermission, IDataView, IViewMetadata, IDataSet, FilterExpression, SortExpression, ITreeManager } from './types'
import { FilterExpressionParser } from './filterExpressionParser'
import { Logger } from '@spark-view/spark-utils'

/**
 * 数据视图类（实现 IDataView 接口 + 方法逻辑）
 */
export class DataView implements IDataView {
  currentRow: IDataRowWithPermission | null = null
  currentRowIndex: number | null = null  // 当前行索引
  selectedRows: IDataRowWithPermission[] = []
  selectedRowIndices: number[] = []      // 选中行索引数组
  rows: IDataRowWithPermission[] = []
  private __originalRows?: IDataRowWithPermission[]
  
  // 宿主信息
  private __hostTable: string
  private __contextId: string
  
  protected logger = Logger('DataView')
  
  // 初始配置
  filterExpression?: FilterExpression
  sortExpression?: SortExpression
  autoSelectFirst?: boolean  // 自动选中第一行
  autoDeselectOnEmpty?: boolean  // 数据清空时自动取消选中
  
  // 分页状态（运行时必需）
  total: number = 0           // 总记录数
  page: number = 1            // 当前页码（1-based）
  pageSize: number = 20       // 每页大小
  
  // @deprecated 使用独立的 total/page/pageSize 字段
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
    this.__hostTable = hostTable
    this.__contextId = contextId
    this.dataSet = dataSet
  }
  
  // ==================== 公共访问器 ====================
  
  /** 获取宿主表名 */
  get hostTable(): string { return this.__hostTable }
  
  /** 获取上下文 ID */
  get contextId(): string { return this.__contextId }
  
  /** 获取原始数据行（过滤/排序前的完整数据） */
  get originalRows(): IDataRowWithPermission[] | undefined { return this.__originalRows }
  
  /** 设置原始数据行 */
  set originalRows(value: IDataRowWithPermission[] | undefined) { this.__originalRows = value }
  
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
    if (treeManager && typeof treeManager.setDataView === 'function') {
      treeManager.setDataView(this)
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
   * 
   * @param row - 要选中的行数据，传入 null 则取消选中
   * @param skipNotify - 是否跳过当前表的 UI 更新通知（默认 false）
   *   - `true`: 不更新当前表格 UI，但仍会触发关联表更新
   *   - `false`: 触发完整的更新流程（关联表 + 订阅者 + 事件）
   * 
   * @remarks
   * - 自动防重：如果新行与现有行相同（引用比较），则跳过更新
   * - 级联更新：会自动触发依赖此上下文的子表过滤
   * - 事件触发：会触发 `currentRowChanged` 事件（除非 skipNotify=true）
   * 
   * @example
   * ```typescript
   * // 选中第一行并触发级联
   * context.setCurrentRow(rows[0])
   * 
   * // 取消选中
   * context.setCurrentRow(null)
   * 
   * // 内部同步（不触发 UI 更新）
   * context.setCurrentRow(row, true)
   * ```
   * 
   * @fires DataSet#currentRowChanged - 当 skipNotify=false 时触发
   */
  setCurrentRow(row: IDataRowWithPermission | null, skipNotify: boolean = false): void {
    // 防重复检查 - 只比较引用
    const existingRow = this.currentRow
    const isSameRow = existingRow === row
    
    if (isSameRow) {
      console.info(`⏭️ [Context] ${this.hostTable}.${this.contextId}.currentRow 未变化`)
      return
    }
    
    console.info(`🔄 [Context] ${this.hostTable}.${this.contextId}.currentRow 更新`, { from: existingRow, to: row })
    this.currentRow = row
    
    // 同步维护索引
    this.currentRowIndex = row === null ? null : this.rows.indexOf(row)
    if (this.currentRowIndex === -1) {
      this.currentRowIndex = null  // 如果行不在 rows 中，设为 null
    }
    
    if (!skipNotify && this.dataSet) {
      // 触发关系更新
      this.dataSet.updateRelatedTables(this.hostTable, this.contextId)
      
      // 通知订阅者
      this.dataSet.notifySubscribers(this.hostTable, this.contextId)
      
      // 触发事件
      this.dataSet.emit('currentRowChanged', { 
        tableName: this.hostTable, 
        contextId: this.contextId, 
        row 
      })
    }
  }

  /**
   * 设置选中行集合
   * 
   * @param rows - 选中的行数据数组
   * @param skipNotify - 是否跳过当前表的 UI 更新通知（默认 false）
   *   - `true`: 不通知当前表的订阅者，但仍会触发关联表更新
   *   - `false`: 触发完整的更新流程
   * 
   * @remarks
   * - 自动防重：比较数组长度和元素引用，相同则跳过
   * - 级联更新：始终触发 updateRelatedTables（过滤依赖此上下文的子表）
   * - 订阅通知：根据 skipNotify 决定是否通知当前表的订阅者
   * - 事件触发：仅在 skipNotify=false 时触发，避免 UI→数据→UI 循环
   * 
   * @example
   * ```typescript
   * // 选中多行
   * context.setSelectedRows([row1, row2, row3])
   * 
   * // 清空选中
   * context.setSelectedRows([])
   * 
   * // 内部同步（避免循环通知）
   * context.setSelectedRows(rows, true)
   * ```
   * 
   * @fires DataSet#selectedRowsChanged - 当 skipNotify=false 时触发
   */
  setSelectedRows(rows: IDataRowWithPermission[], skipNotify: boolean = false): void {
    // 防重复检查：只比较引用
    const existingRows = this.selectedRows || []
    const isSameSelection = (
      existingRows.length === rows.length &&
      existingRows.every((existingRow, index) => existingRow === rows[index])
    )
    
    if (isSameSelection) {
      console.info(`⏭️ [Context] ${this.hostTable}.${this.contextId}.selectedRows 未变化`)
      return
    }
    
    console.info(`🔄 [Context] ${this.hostTable}.${this.contextId}.selectedRows 更新`, { 
      from: existingRows.length, 
      to: rows.length 
    })
    this.selectedRows = rows
    
    // 同步维护索引数组
    this.selectedRowIndices = rows
      .map(row => this.rows.indexOf(row))
      .filter(index => index !== -1)  // 过滤掉不在 rows 中的行
    
    if (this.dataSet) {
      // ✅ 始终触发关系更新（过滤子表）
      this.dataSet.updateRelatedTables(this.hostTable, this.contextId)
      
      // ❓ 根据 skipNotify 决定是否通知当前表的订阅者
      if (!skipNotify) {
        this.dataSet.notifySubscribers(this.hostTable, this.contextId)
        
        // 🔔 仅在非 skipNotify 时触发事件（避免 UI→数据→UI 循环）
        this.dataSet.emit('selectedRowsChanged', { 
          tableName: this.hostTable, 
          contextId: this.contextId, 
          rows 
        })
      }
    }
  }

  /**
   * 手动触发通知
   * 
   * @remarks
   * 用于手动触发订阅者更新，通常在以下场景使用：
   * - 批量修改数据后一次性通知
   * - 手动刷新 UI
   * - 强制重新计算依赖关系
   * 
   * @example
   * ```typescript
   * // 批量修改后通知
   * context.rows.push(newRow1, newRow2, newRow3)
   * context.notifyChange()  // 一次性通知所有订阅者
   * ```
   */
  notifyChange(): void {
    if (this.dataSet) {
      this.dataSet.notifySubscribers(this.hostTable, this.contextId)
    }
  }

  /**
   * 清空所有状态（用于条件不满足时递归清空）
   * 
   * @param skipNotify - 是否跳过通知（默认 false）
   * 
   * @remarks
   * - 清空 rows, currentRow, selectedRows
   * - **不**清空 _originalRows（保留缓存数据）
   * - 使用 splice 保持 Vue 响应式引用
   * - 仅在数据发生变化时触发通知
   * 
   * @example
   * ```typescript
   * // 主表选中为空，清空子表
   * if (!parentContext.currentRow) {
   *   childContext.clearAll()
   * }
   * ```
   * 
   * @fires DataSet#contextCleared - 当数据发生变化且 skipNotify=false 时触发
   */
  clearAll(skipNotify: boolean = false): void {
    const hadData = this.rows.length > 0 || this.currentRow !== null || this.selectedRows.length > 0;
    
    // ✅ 使用 splice 保持 Vue 响应式引用
    this.rows.splice(0, this.rows.length);
    this.currentRow = null;
    this.selectedRows.splice(0, this.selectedRows.length);
    // 注意：不清空 _originalRows，保留缓存数据
    
    if (hadData) {
      console.info(`🧹 [Context] ${this.hostTable}.${this.contextId} 已清空所有状态`);
    }
    
    if (!skipNotify && hadData && this.dataSet) {
      this.dataSet.notifySubscribers(this.hostTable, this.contextId);
      // 触发清空事件
      this.dataSet.emit('contextCleared', { tableName: this.hostTable, contextId: this.contextId });
    }
  }

  /**
   * 应用排序表达式
   */
  private applySorting(rows: IDataRow[], sortExpression: SortExpression): IDataRow[] {
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
  private sortByField(rows: IDataRow[], field: string, direction: string): IDataRow[] {
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
  private sortByFields(rows: IDataRow[], fields: Array<{ field: string; direction: string }>): IDataRow[] {
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
   * 
   * @param sourceData - 完整数据源（通常是 table.originalRows 或 table.rows）
   * 
   * @remarks
   * 此方法会按顺序执行：
   * 1. **过滤**：根据 filterExpression 过滤数据
   * 2. **排序**：根据 sortExpression 排序数据
   * 3. **更新**：将结果赋值给 this.rows
   * 
   * 注意事项：
   * - 不会触发通知，需要调用方手动触发
   * - 过滤/排序失败会记录错误日志，不会抛出异常
   * - 创建数据副本，不会修改源数据
   * 
   * @example
   * ```typescript
   * // 重新应用过滤和排序
   * context.updateRows(table.originalRows)
   * 
   * // 主从表场景：子表基于父表选中行过滤
   * const filtered = parentTable.originalRows.filter(r => r.parentId === parentRow.id)
   * childContext.updateRows(filtered)
   * ```
   */
  updateRows(sourceData: IDataRow[]): void {
    let result = [...sourceData];
    
    // 1. 执行过滤
    if (this.filterExpression) {
      try {
        const filterFn = FilterExpressionParser.toMemoryFilter(this.filterExpression);
        result = result.filter(filterFn);
      } catch (e) {
        this.logger.error(`过滤失败:`, e);
        result = [];
      }
    }
    
    // 2. 执行排序
    if (this.sortExpression) {
      try {
        result = this.applySorting(result, this.sortExpression);
      } catch (e) {
        this.logger.error(`排序失败:`, e);
      }
    }
    
    this.rows = result;
  }

  /**
   * 刷新上下文（重新应用过滤和排序）
   * @param sourceData 完整数据源
   */
  refresh(sourceData: IDataRow[]): void {
    this.updateRows(sourceData);
    console.info(`✅ [Refresh] 上下文 ${this.contextId} 已刷新，当前 ${this.rows.length} 行`);
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
        console.info(`🧹 [Cleanup] ${this.hostTable}.${this.contextId}.currentRow 不在上下文数据中，清空`);
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
        console.info(`🧹 [Cleanup] ${this.hostTable}.${this.contextId}.selectedRows 清理: ${this.selectedRows.length} -> ${validSelectedRows.length}`);
        this.selectedRows = validSelectedRows;
        needsCleanup = true;
      }
    }
    
    return needsCleanup;
  }

  /**
   * 转换为纯数据对象（新）
   */
  toData(): IViewMetadata {
    return {
      // 配置数据
      hostTable: this.__hostTable,
      contextId: this.__contextId,
      filterExpression: this.filterExpression,
      sortExpression: this.sortExpression,
      autoSelectFirst: this.autoSelectFirst,
      autoDeselectOnEmpty: this.autoDeselectOnEmpty,
      // 分页配置
      page: this.page,
      pageSize: this.pageSize
    }
  }

  /**
   * 转换为普通对象（用于序列化）
   * @deprecated 请使用 toData() 方法
   */
  toJSON() {
    return this.toData()
  }

  /**
   * 从数据对象创建实例（新）
   */
  static fromData(data: IViewMetadata, hostTable: string, contextId: string, dataSet?: IDataSet): DataView {
    const context = new DataView(hostTable, contextId, dataSet)

    // 配置数据
    context.filterExpression = data.filterExpression
    context.sortExpression = data.sortExpression
    context.autoSelectFirst = data.autoSelectFirst
    context.autoDeselectOnEmpty = data.autoDeselectOnEmpty
    // 分页配置
    context.page = data.page ?? 1
    context.pageSize = data.pageSize ?? 20

    // 运行时状态使用默认值（不从配置中恢复）
    // currentRow, selectedRows, rows 等运行时状态应该在运行时设置

    return context
  }

  /**
   * 从普通对象创建实例
   * @deprecated 请使用 fromData() 方法
   */
  static fromJSON(data: Partial<IDataView>, hostTable: string, contextId: string, dataSet?: IDataSet): DataView {
    return DataView.fromData(data as IViewMetadata, hostTable, contextId, dataSet)
  }
}
