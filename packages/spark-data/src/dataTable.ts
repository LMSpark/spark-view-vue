/**
 * DataTable 类 - 数据表
 * 继承 BindingContext，实现 IDataTable 接口
 * 相当于 .NET 的 DataTable - 结构层
 */

import { BindingContext } from './bindingContext'
import type { IDataTable, IBindingContext, DataColumn, CrudApi, IDataSet } from './types'

/**
 * 数据表类（实现 IDataTable 接口 + 方法逻辑）
 */
export class DataTable extends BindingContext implements IDataTable {
  tableName: string
  columns: DataColumn[]
  api?: CrudApi
  contexts: Record<string, BindingContext> = {}
  
  // 扩展属性
  loading?: boolean
  error?: string

  constructor(
    tableName: string,
    columns: DataColumn[] = [],
    dataSet?: IDataSet
  ) {
    super(tableName, 'default', dataSet)
    this.tableName = tableName
    this.columns = columns
  }

  /**
   * 获取或创建上下文
   */
  getOrCreateContext(contextId: string): BindingContext {
    if (contextId === 'default') {
      return this
    }
    
    if (!this.contexts[contextId]) {
      this.contexts[contextId] = new BindingContext(
        this.tableName,
        contextId,
        this.dataSet
      )
      console.info(`✨ [DataTable] 自动创建上下文: ${this.tableName}.${contextId}`)
    }
    
    return this.contexts[contextId]
  }

  /**
   * 刷新所有上下文（重新应用过滤和排序）
   */
  refreshAllContexts(): void {
    const sourceData = this._originalRows ?? this.rows ?? [];
    
    // 刷新所有自定义上下文
    Object.values(this.contexts).forEach(context => {
      if (context.filterExpression || context.sortExpression) {
        context.updateRows(sourceData);
        console.info(`🔄 [DataTable] 刷新上下文: ${this.tableName}.${context._contextId}`);
      }
    });
  }

  /**
   * 转换为普通对象（用于序列化）
   */
  toPlainObject(): IDataTable {
    return {
      tableName: this.tableName,
      columns: this.columns,
      api: this.api,
      currentRow: this.currentRow,
      selectedRows: this.selectedRows,
      rows: this.rows,
      _originalRows: this._originalRows,
      _hostTable: this._hostTable,
      _contextId: this._contextId,
      filterExpression: this.filterExpression,
      sortExpression: this.sortExpression,
      pagination: this.pagination,
      contexts: this.contextsToPlainObject(),
      loading: this.loading,
      error: this.error
    }
  }

  /**
   * 转换上下文为普通对象
   */
  private contextsToPlainObject(): Record<string, IBindingContext> {
    const result: Record<string, IBindingContext> = {}
    Object.entries(this.contexts).forEach(([contextId, context]) => {
      result[contextId] = {
        currentRow: context.currentRow,
        selectedRows: context.selectedRows,
        rows: context.rows,
        _originalRows: context._originalRows,
        _hostTable: context._hostTable,
        _contextId: context._contextId,
        filterExpression: context.filterExpression,
        sortExpression: context.sortExpression,
        pagination: context.pagination
      }
    })
    return result
  }

  /**
   * 从普通对象创建实例
   */
  static fromPlainObject(data: IDataTable, dataSet?: IDataSet): DataTable {
    const table = new DataTable(data.tableName, data.columns ?? [], dataSet)
    
    // 基本属性
    table.api = data.api
    table.currentRow = data.currentRow ?? null
    table.selectedRows = data.selectedRows ?? []
    table.rows = data.rows ?? []
    table._originalRows = data._originalRows
    table.filterExpression = data.filterExpression
    table.sortExpression = data.sortExpression
    table.pagination = data.pagination
    table.loading = data.loading
    table.error = data.error
    
    // 转换上下文
    if (data.contexts) {
      if (Array.isArray(data.contexts)) {
        // 兼容旧格式：数组
        console.info(`🔄 [DataTable] 转换 ${table.tableName}.contexts 为 Record 格式`)
        data.contexts.forEach((ctx: Partial<IBindingContext>, index: number) => {
          const contextId = `ctx_${index + 1}`
          table.contexts[contextId] = BindingContext.fromJSON(
            ctx,
            table.tableName,
            contextId,
            dataSet
          )
        })
      } else {
        // 新格式：Record
        Object.entries(data.contexts).forEach(([contextId, ctxData]) => {
          table.contexts[contextId] = BindingContext.fromJSON(
            ctxData as Partial<IBindingContext>,
            table.tableName,
            contextId,
            dataSet
          )
        })
      }
    }
    
    return table
  }
}
