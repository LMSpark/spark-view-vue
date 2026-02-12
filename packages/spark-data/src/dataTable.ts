/**
 * DataTable 类 - 数据表
 * 继承 BindingContext，实现 IDataTable 接口
 * 相当于 .NET 的 DataTable - 结构层
 */

import { BindingContext } from './bindingContext'
import { Logger, type Request } from '@spark-view/spark-utils'
import type {
  IDataTable,
  IDataTableWithApi,
  IBindingContext,
  DataColumn,
  CrudApi,
  IDataSet,
  IDataRow
} from './types'

/**
 * 数据表类（实现 IDataTableWithApi 接口 + 方法逻辑）
 */
export class DataTable extends BindingContext implements IDataTableWithApi {
  tableName: string
  columns: DataColumn[]
  api?: CrudApi
  contexts: Record<string, BindingContext> = {}

  // 扩展属性
  loading?: boolean
  error?: string

  // 日志系统（继承自 BindingContext）

  // HTTP 请求实例（注入）
  private request?: Request

  // ==================== 构造函数 ====================

  constructor(
    tableName: string,
    columns: DataColumn[] = [],
    dataSet?: IDataSet,
    request?: Request
  ) {
    super(tableName, 'default', dataSet)
    this.tableName = tableName
    this.columns = columns
    this.request = request
  }

  /**
   * 设置 HTTP 请求实例（由 DataSet 或应用层注入）
   */
  setApiAdapter(request: Request): void {
    this.request = request
  }

  // ==================== 工具方法 ====================

  /**
   * 执行 API 请求的通用包装器（消除重复的错误处理和 loading 逻辑）
   * @private
   */
  private async executeApi<T>(
    apiEndpoint: string,
    execute: () => Promise<T>
  ): Promise<T> {
    this.loading = true
    this.error = undefined

    try {
      const result = await execute()
      this.logger.info(`✅ [DataTable] ${this.tableName}.${apiEndpoint}() 成功`)
      return result
    } catch (error) {
      // 优雅的错误处理：支持 Error 对象和字符串
      this.error = error instanceof Error
        ? error.message
        : typeof error === 'string'
        ? error
        : '未知错误'
      this.logger.error(`❌ [DataTable] ${this.tableName}.${apiEndpoint}() 失败`, error)
      throw error
    } finally {
      this.loading = false
    }
  }

  /**
   * 验证 API 配置和适配器
   * @private
   */
  private validateApi(endpoint: string, apiPath: unknown): void {
    if (!apiPath) {
      throw new Error(`表 ${this.tableName} 未配置 ${endpoint} API`)
    }
    if (!this.request) {
      throw new Error('未注入 HTTP 请求实例，无法执行 API 调用')
    }
  }

  /**
   * 更新行记录（同时更新 rows 和 __originalRows）
   * @private
   */
  private updateRowInBoth(predicate: (row: IDataRow) => boolean, updater: (row: IDataRow) => void): void {
    const index = this.rows.findIndex(predicate)
    if (index > -1) {
      const row = this.rows[index]
      if (row) {
        updater(row)
      }
    }

    const originalRows = this['__originalRows']
    if (originalRows) {
      const cacheIndex = originalRows.findIndex(predicate)
      if (cacheIndex > -1) {
        const cachedRow = originalRows[cacheIndex]
        if (cachedRow) {
          updater(cachedRow)
        }
      }
    }
  }

  /**
   * 从两个数组中删除行
   * @private
   */
  private removeRowFromBoth(predicate: (row: IDataRow) => boolean): void {
    const index = this.rows.findIndex(predicate)
    if (index > -1) {
      this.rows.splice(index, 1)
    }

    const originalRows = this['__originalRows']
    if (originalRows) {
      const cacheIndex = originalRows.findIndex(predicate)
      if (cacheIndex > -1) {
        originalRows.splice(cacheIndex, 1)
      }
    }
  }

  // ==================== CRUD API 方法 ====================

  /**
   * 列表查询
   */
  async list(params?: Record<string, unknown>): Promise<IDataRow[]> {
    this.validateApi('list', this.api?.list)

    return this.executeApi('list', async () => {
      // validateApi 已确保 apiAdapter 和 api.list 存在
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const data = await this.request!.executeEndpoint<IDataRow[]>(this.api!.list!, params)

      // 替换全部数据
      this.rows.splice(0, this.rows.length, ...data)
      this['__originalRows'] = [...data]

      this.logger.info(`📊 加载 ${data.length} 行数据`)
      return data
    })
  }

  /**
   * 创建记录
   */
  async create(data: IDataRow): Promise<IDataRow> {
    this.validateApi('create', this.api?.create)

    return this.executeApi('create', async () => {
      // validateApi 已确保 apiAdapter 和 api.create 存在
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const result = await this.request!.executeEndpoint<IDataRow>(this.api!.create!, data)

      // 追加到两个数组
      this.rows.push(result)
      const originalRows = this['__originalRows']
      if (originalRows) {
        originalRows.push(result)
      }

      return result
    })
  }

  /**
   * 更新记录
   */
  async update(id: string | number, data: Partial<IDataRow>): Promise<IDataRow> {
    this.validateApi('update', this.api?.update)

    return this.executeApi('update', async () => {
      // validateApi 已确保 apiAdapter 和 api.update 存在
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const result = await this.request!.executeEndpoint<IDataRow>(this.api!.update!, { id, ...data })

      // 更新两个数组中的记录
      this.updateRowInBoth(
        r => r.id === id,
        row => Object.assign(row, result)
      )

      return result
    })
  }

  /**
   * 删除记录
   */
  async delete(id: string | number): Promise<boolean> {
    this.validateApi('delete', this.api?.delete)

    return this.executeApi('delete', async () => {
      // validateApi 已确保 apiAdapter 和 api.delete 存在
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await this.request!.executeEndpoint(this.api!.delete!, { id })

      // 从两个数组中删除
      this.removeRowFromBoth(r => r.id === id)

      return true
    })
  }

  /**
   * 批量创建
   */
  async batchCreate(data: IDataRow[]): Promise<IDataRow[]> {
    this.validateApi('batch.create', this.api?.batch?.create)

    return this.executeApi('batchCreate', async () => {
      // validateApi 已确保 apiAdapter 和 api.batch.create 存在
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const result = await this.request!.executeEndpoint<IDataRow[]>(this.api!.batch!.create!, { items: data })

      // 批量追加
      this.rows.push(...result)
      const originalRows = this['__originalRows']
      if (originalRows) {
        originalRows.push(...result)
      }

      this.logger.info(`📊 批量创建 ${result.length} 条`)
      return result
    })
  }

  /**
   * 批量更新
   */
  async batchUpdate(updates: Array<{ id: string | number; data: Partial<IDataRow> }>): Promise<IDataRow[]> {
    this.validateApi('batch.update', this.api?.batch?.update)

    return this.executeApi('batchUpdate', async () => {
      // validateApi 已确保 apiAdapter 和 api.batch.update 存在
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const result = await this.request!.executeEndpoint<IDataRow[]>(this.api!.batch!.update!, { items: updates })

      // 批量更新
      result.forEach(updated => {
        this.updateRowInBoth(
          r => r.id === updated.id,
          row => Object.assign(row, updated)
        )
      })

      this.logger.info(`📊 批量更新 ${result.length} 条`)
      return result
    })
  }

  /**
   * 批量删除
   */
  async batchDelete(ids: Array<string | number>): Promise<boolean> {
    this.validateApi('batch.delete', this.api?.batch?.delete)

    return this.executeApi('batchDelete', async () => {
      // validateApi 已确保 apiAdapter 和 api.batch.delete 存在
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await this.request!.executeEndpoint(this.api!.batch!.delete!, { ids })

      // 批量删除
      ids.forEach(id => {
        this.removeRowFromBoth(r => r.id === id)
      })

      this.logger.info(`📊 批量删除 ${ids.length} 条`)
      return true
    })
  }

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
      originalRows: this.originalRows,
      hostTable: this.hostTable,
      contextId: this.contextId,
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
        originalRows: context.originalRows,
        hostTable: context.hostTable,
        contextId: context.contextId,
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
