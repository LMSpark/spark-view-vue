/**
 * DataTable 类 - 数据表
 * 继承 BindingContext，实现 IDataTable 接口
 * 相当于 .NET 的 DataTable - 结构层
 */

import { BindingContext } from './bindingContext'
import { Logger } from '@spark-view/spark-utils'
import type {
  IDataTable,
  IDataTableData,
  IBindingContext,
  IBindingContextData,
  DataColumn,
  CrudApi,
  IDataSet
} from './types'

/**
 * 数据表类（实现 IDataTable 接口）
 */
export class DataTable extends BindingContext implements IDataTable {
  tableName: string
  columns: DataColumn[]
  api?: CrudApi
  contexts: Record<string, BindingContext> = {}

  // 扩展属性
  loading?: boolean
  error?: string

  // 日志系统（继承自 BindingContext）

  // ==================== 构造函数 ====================

  constructor(
    tableName: string,
    columns: DataColumn[] = [],
    dataSet?: IDataSet
  ) {
    super(tableName, 'default', dataSet)
    this.tableName = tableName
    this.columns = columns
  }

  // ==================== 工具方法 ====================

  // ==================== 上下文管理 ====================

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
      this.logger.info(`✨ [DataTable] 自动创建上下文: ${this.tableName}.${contextId}`)
    }

    const context = this.contexts[contextId]
    if (!context) {
      throw new Error(`Failed to create context: ${contextId}`)
    }
    return context
  }

  /**
   * 刷新所有上下文（重新应用过滤和排序）
   */
  refreshAllContexts(): void {
    const sourceData = this.originalRows ?? this.rows ?? [];

    // 刷新所有自定义上下文
    Object.values(this.contexts).forEach(context => {
      if (context.filterExpression || context.sortExpression) {
        context.updateRows(sourceData);
        this.logger.info(`🔄 [DataTable] 刷新上下文: ${this.tableName}.${context.contextId}`);
      }
    });
  }

  // ==================== 序列化 ====================

  /**
   * 转换为纯数据对象（用于序列化）
   */
  override toData(): IDataTableData {
    return {
      tableName: this.tableName,
      columns: this.columns,
      api: this.api,
      currentRow: this.currentRow,
      selectedRows: this.selectedRows,
      rows: this.rows,
      originalRows: this.originalRows,
      hostTable: this.hostTable,
      contextId: this.contextId,
      filterExpression: this.filterExpression,
      sortExpression: this.sortExpression,
      pagination: this.pagination,
      contexts: this.contextsToData(),
      loading: this.loading,
      error: this.error
    }
  }

  /**
   * @deprecated 使用 toData() 替代
   */
  toPlainObject(): IDataTableData {
    return this.toData()
  }

  /**
   * 转换上下文为纯数据对象
   */
  private contextsToData(): Record<string, IBindingContextData> {
    const result: Record<string, IBindingContextData> = {}
    Object.entries(this.contexts).forEach(([contextId, context]) => {
      result[contextId] = context.toData()
    })
    return result
  }

  /**
   * 从数据对象创建 DataTable 实例（静态工厂方法）
   */
  static fromTableData(data: IDataTableData, dataSet?: IDataSet): DataTable {
    const table = new DataTable(data.tableName, data.columns ?? [], dataSet)

    // 基本属性
    table.api = data.api
    table.currentRow = data.currentRow ?? null
    table.selectedRows = data.selectedRows ?? []
    table.rows = data.rows ?? []
    table['__originalRows'] = data.originalRows  // 直接访问私有字段
    table.filterExpression = data.filterExpression
    table.sortExpression = data.sortExpression
    table.pagination = data.pagination
    table.loading = data.loading
    table.error = data.error

    // 转换上下文
    if (data.contexts) {
      if (Array.isArray(data.contexts)) {
        // 兼容旧格式：数组
        Logger().info(`🔄 [DataTable] 转换 ${table.tableName}.contexts 为 Record 格式`)
        data.contexts.forEach((ctx: Partial<IBindingContext>, index: number) => {
          const contextId = `ctx_${index + 1}`
          table.contexts[contextId] = BindingContext.fromData(
            ctx as IBindingContextData,
            table.tableName,
            contextId,
            dataSet
          )
        })
      } else {
        // 新格式：Record
        Object.entries(data.contexts).forEach(([contextId, ctxData]) => {
          table.contexts[contextId] = BindingContext.fromData(
            ctxData,
            table.tableName,
            contextId,
            dataSet
          )
        })
      }
    }
    
    return table
  }

  /**
   * @deprecated 请使用 fromTableData() 方法
   */
  static fromPlainObject(data: IDataTable, dataSet?: IDataSet): DataTable {
    return DataTable.fromTableData(data, dataSet)
  }
}
