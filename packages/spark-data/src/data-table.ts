/**
 * DataTable 类 - 数据表
 * 继承 DataView，实现 IDataTable 接口
 * 相当于 .NET 的 DataTable - 结构层
 */

import { DataView } from './data-view'
import { Logger } from '@spark-view/spark-utils'
import type {
  IDataTable,
  ITableMetadata,
  IDataView,
  IViewMetadata,
  DataColumn,
  CrudApi,
  IDataSet
} from './types'

/**
 * 数据表类（实现 IDataTable 接口）
 */
export class DataTable extends DataView implements IDataTable {
  tableName: string
  columns: DataColumn[]
  api?: CrudApi
  contexts: Record<string, DataView> = {}

  // 扩展属性
  loading?: boolean
  error?: string

  // 日志系统（继承自 DataView）

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
  getOrCreateContext(contextId: string): DataView {
    if (contextId === 'default') {
      return this
    }

    if (!this.contexts[contextId]) {
      this.contexts[contextId] = new DataView(
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
  override toData(): ITableMetadata {
    return {
      tableName: this.tableName,
      columns: this.columns,
      api: this.api,
      // 配置数据（从 IViewMetadata）
      hostTable: this.hostTable,
      contextId: this.contextId,
      filterExpression: this.filterExpression,
      sortExpression: this.sortExpression,
      autoSelectFirst: this.autoSelectFirst,
      autoDeselectOnEmpty: this.autoDeselectOnEmpty,
      page: this.page,
      pageSize: this.pageSize,
      // 扩展属性
      loading: this.loading,
      error: this.error,
      // 其他上下文的配置数据
      contexts: this.contextsToData()
    }
  }

  /**
   * @deprecated 使用 toData() 替代
   */
  toPlainObject(): ITableMetadata {
    return this.toData()
  }

  /**
   * 转换上下文为纯数据对象
   */
  private contextsToData(): Record<string, IViewMetadata> {
    const result: Record<string, IViewMetadata> = {}
    Object.entries(this.contexts).forEach(([contextId, context]) => {
      result[contextId] = context.toData()
    })
    return result
  }

  /**
   * 从数据对象创建 DataTable 实例（静态工厂方法）
   */
  static fromTableData(data: ITableMetadata, dataSet?: IDataSet): DataTable {
    const table = new DataTable(data.tableName, data.columns ?? [], dataSet)

    // 基本属性
    table.api = data.api
    // 设置数据行（转换为带权限的数据行）
    if (data.rows) {
      table.rows = data.rows.map(row => ({ ...row, __permissions: {} }))
    }
    // 配置数据（从 ViewConfig）
    table.filterExpression = data.filterExpression
    table.sortExpression = data.sortExpression
    table.autoSelectFirst = data.autoSelectFirst
    table.autoDeselectOnEmpty = data.autoDeselectOnEmpty
    table.page = data.page ?? 1
    table.pageSize = data.pageSize ?? 20
    // 扩展属性
    table.loading = data.loading
    table.error = data.error

    // 转换上下文（只读取配置数据）
    if (data.contexts) {
      if (Array.isArray(data.contexts)) {
        // 兼容旧格式：数组
        Logger().info(`🔄 [DataTable] 转换 ${table.tableName}.contexts 为 Record 格式`)
        data.contexts.forEach((ctx: Partial<IDataView>, index: number) => {
          const contextId = `ctx_${index + 1}`
          table.contexts[contextId] = DataView.fromData(
            ctx as IViewMetadata,
            table.tableName,
            contextId,
            dataSet
          )
        })
      } else {
        // 新格式：Record
        Object.entries(data.contexts).forEach(([contextId, ctxData]) => {
          table.contexts[contextId] = DataView.fromData(
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
