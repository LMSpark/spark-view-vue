/**
 * DataTable — 数据表（结构 + 多视图管理）
 *
 * 继承 DataView 作为默认视图，管理额外的命名视图
 */

import { DataView } from './data-view'
import { CrudService, createCrudService } from './crud-service'
import { FIELD_METADATA } from '@spark-view/spark-utils'
import type { Provider as CapabilityProvider, CapabilityKey } from '@spark-view/spark-utils'
import type { IDataRow, DataColumn, CrudApi, ITableMetadata, QueryParams, CrudResult, BatchResult } from './types'

export class DataTable extends DataView {
  // 表特有属性
  tableName: string
  columns: DataColumn[]
  api?: CrudApi
  contexts: Record<string, DataView> = {}

  // CRUD服务实例
  private crudService?: CrudService

  constructor(tableName: string, columns: DataColumn[] = []) {
    super(tableName, 'default')
    this.tableName = tableName
    this.columns = columns
    this.initializeCrudService()
  }

  /**
   * 发送事件（DataTable级别事件）
   */
  emit(event: string, data: unknown): void {
    // 如果有关联的dataSet，通过dataSet发送事件
    if (this.dataSet) {
      this.dataSet.emit(event, data)
    } else {
      // 否则创建简单的日志记录
      this.logger.info(`Event: ${event}`, data)
    }
  }

  // ===== 能力注册（供 CapabilityManager 调用） =====

  getCapabilities(): Map<CapabilityKey<unknown>, CapabilityProvider> {
    const caps = new Map<CapabilityKey<unknown>, CapabilityProvider>()

    // 字段元数据
    const meta: Record<string, Record<string, unknown>> = {}
    for (const col of this.columns) {
      meta[col.name] = {
        label: col.label ?? col.name,
        type: col.type,
        isPrimaryKey: col.isPrimaryKey,
        allowDBNull: col.allowDBNull,
        defaultValue: col.defaultValue,
      }
    }
    caps.set(FIELD_METADATA as CapabilityKey<unknown>, {
      name: FIELD_METADATA,
      implementation: meta,
    })

    return caps
  }

  // ===== 上下文管理 =====

  getOrCreateContext(contextId: string): DataView {
    if (contextId === 'default') return this
    this.contexts[contextId] ??= new DataView(this.tableName, contextId, this.dataSet)
    return this.contexts[contextId] as DataView
  }

  /** 把原始数据重新分发到所有子上下文 */
  refreshAllContexts(): void {
    const src = this.originalRows ?? this.rows ?? []
    for (const ctx of Object.values(this.contexts)) {
      // 子上下文的数据来源是表的原始数据
      // 实际过滤由后端完成，这里只做同步
      if (ctx.originalRows) {
        ctx.rows.splice(0, ctx.rows.length, ...ctx.originalRows)
      } else {
        ctx.rows.splice(0, ctx.rows.length, ...src)
      }
    }
  }

  // ===== 序列化 =====

  override toData(): ITableMetadata {
    const ctxData: Record<string, import('./types').IViewMetadata> = {}
    for (const [id, ctx] of Object.entries(this.contexts)) {
      ctxData[id] = ctx.toData()
    }
    const result: ITableMetadata = {
      tableName: this.tableName,
      columns: this.columns,
      hostTable: this.hostTable,
      contextId: this.contextId,
      contexts: ctxData,
      api: this.api,
      loading: this.isLoading,
      error: this.loadingError?.message,
      rows: this.rows,
      filterExpression: this.filterExpression,
      sortExpression: this.sortExpression,
      autoSelectFirst: this.autoSelectFirst,
      page: this.page,
      pageSize: this.pageSize,
    }
    
    if (this.api !== undefined) result.api = this.api
    if (this.filterExpression !== undefined) result.filterExpression = this.filterExpression
    if (this.sortExpression !== undefined) result.sortExpression = this.sortExpression
    if (this.autoSelectFirst !== undefined) result.autoSelectFirst = this.autoSelectFirst
    if (this.page !== undefined) result.page = this.page
    if (this.pageSize !== undefined) result.pageSize = this.pageSize
    
    return result
  }

  // ===== CRUD服务初始化 =====

  /**
   * 初始化CRUD服务
   */
  private initializeCrudService(): void {
    if (this.api) {
      this.crudService = createCrudService(this.api)
    }
  }

  /**
   * 更新API配置
   */
  setApi(api: CrudApi): void {
    this.api = api
    this.initializeCrudService()
  }

  // ===== 网络CRUD操作 =====

  /**
   * 从服务器加载数据
   */
  async loadFromServer(params?: QueryParams): Promise<CrudResult> {
    if (!this.crudService) {
      throw new Error(`Table ${this.tableName} has no API configuration`)
    }

    this.isLoading = true
    try {
      const result = await this.crudService.list(params)
      if (result.success && result.data) {
        // 处理服务器返回的数据格式
        const data = result.data as {
          rows?: IDataRow[]
          total?: number
          page?: number
          pageSize?: number
        }
        if (data.rows) {
          this.rows = data.rows
          this.total = data.total ?? 0
          this.page = data.page ?? 1
          this.pageSize = data.pageSize ?? 20
        } else if (Array.isArray(data)) {
          this.rows = data
        }
        this.emit('dataLoaded', { tableName: this.tableName, data: result.data })
      }
      return result
    } catch (error) {
      this.loadingError = error as Error
      throw error
    } finally {
      this.isLoading = false
    }
  }

  /**
   * 创建新记录
   */
  async createRecord(data: Partial<IDataRow>): Promise<CrudResult<IDataRow>> {
    if (!this.crudService) {
      throw new Error(`Table ${this.tableName} has no API configuration`)
    }

    const result = await this.crudService.create<IDataRow>(data)
    if (result.success && result.data) {
      this.rows.push(result.data)
      this.emit('recordCreated', { tableName: this.tableName, record: result.data })
    }
    return result
  }

  /**
   * 更新记录
   */
  async updateRecord(id: string | number, data: Partial<IDataRow>): Promise<CrudResult<IDataRow>> {
    if (!this.crudService) {
      throw new Error(`Table ${this.tableName} has no API configuration`)
    }

    const result = await this.crudService.update<IDataRow>(id, data)
    if (result.success && result.data) {
      const index = this.rows.findIndex(row => row['id'] === id)
      if (index >= 0) {
        this.rows[index] = { ...this.rows[index], ...result.data }
        this.emit('recordUpdated', { tableName: this.tableName, record: result.data })
      }
    }
    return result
  }

  /**
   * 删除记录
   */
  async deleteRecord(id: string | number): Promise<CrudResult<boolean>> {
    if (!this.crudService) {
      throw new Error(`Table ${this.tableName} has no API configuration`)
    }

    const result = await this.crudService.delete(id)
    if (result.success) {
      const index = this.rows.findIndex(row => row['id'] === id)
      if (index >= 0) {
        this.rows.splice(index, 1)
        this.emit('recordDeleted', { tableName: this.tableName, id })
      }
    }
    return result
  }

  /**
   * 批量创建记录
   */
  async batchCreateRecords(items: Partial<IDataRow>[]): Promise<CrudResult<BatchResult>> {
    if (!this.crudService) {
      throw new Error(`Table ${this.tableName} has no API configuration`)
    }

    const result = await this.crudService.batchCreate<IDataRow>(items)
    if (result.success && result.data) {
      // 添加成功创建的记录
      for (const itemResult of result.data.results) {
        if (itemResult.success && itemResult.data) {
          this.rows.push(itemResult.data as IDataRow)
        }
      }
      this.emit('batchCreated', { tableName: this.tableName, results: result.data })
    }
    return result
  }

  /**
   * 批量更新记录
   */
  async batchUpdateRecords(items: Array<{ id: string | number } & Partial<IDataRow>>): Promise<CrudResult<BatchResult>> {
    if (!this.crudService) {
      throw new Error(`Table ${this.tableName} has no API configuration`)
    }

    const result = await this.crudService.batchUpdate<IDataRow>(items)
    if (result.success && result.data) {
      // 更新成功的记录
      for (const itemResult of result.data.results) {
        if (itemResult.success && itemResult.data) {
          const record = itemResult.data as IDataRow
          const index = this.rows.findIndex(row => row['id'] === (record as { id?: unknown }).id)
          if (index >= 0) {
            this.rows[index] = { ...this.rows[index], ...record }
          }
        }
      }
      this.emit('batchUpdated', { tableName: this.tableName, results: result.data })
    }
    return result
  }

  /**
   * 批量删除记录
   */
  async batchDeleteRecords(ids: Array<string | number>): Promise<CrudResult<BatchResult>> {
    if (!this.crudService) {
      throw new Error(`Table ${this.tableName} has no API configuration`)
    }

    const result = await this.crudService.batchDelete(ids)
    if (result.success && result.data) {
      // 移除成功删除的记录
      for (const id of ids) {
        const index = this.rows.findIndex(row => row['id'] === id)
        if (index >= 0) {
          this.rows.splice(index, 1)
        }
      }
      this.emit('batchDeleted', { tableName: this.tableName, results: result.data })
    }
    return result
  }

  /**
   * 导入数据
   */
  async importData(file: File): Promise<CrudResult<{ imported: number; failed: number }>> {
    if (!this.crudService) {
      throw new Error(`Table ${this.tableName} has no API configuration`)
    }

    const result = await this.crudService.importData(file)
    if (result.success) {
      // 重新加载数据
      await this.loadFromServer()
      this.emit('dataImported', { tableName: this.tableName, result: result.data })
    }
    return result
  }

  /**
   * 导出数据
   */
  async exportData(params?: QueryParams): Promise<CrudResult<Blob>> {
    if (!this.crudService) {
      throw new Error(`Table ${this.tableName} has no API configuration`)
    }

    const result = await this.crudService.exportData(params)
    if (result.success) {
      this.emit('dataExported', { tableName: this.tableName })
    }
    return result
  }

  // ===== 工厂方法 =====

  static fromTableData(data: ITableMetadata): DataTable {
    const t = new DataTable(data.tableName, data.columns ?? [])
    if (data.api !== undefined) t.api = data.api
    if (data.rows) {
      t.rows = data.rows.map(r => ({ ...r, __permissions: {} } as IDataRow))
    }
    if (data.filterExpression !== undefined) t.filterExpression = data.filterExpression
    if (data.sortExpression !== undefined) t.sortExpression = data.sortExpression
    if (data.autoSelectFirst !== undefined) t.autoSelectFirst = data.autoSelectFirst
    t.page = data.page ?? 1
    t.pageSize = data.pageSize ?? 20

    if (data.contexts) {
      for (const [cid, cd] of Object.entries(data.contexts)) {
        t.contexts[cid] = DataView.fromData(cd, t.tableName, cid)
      }
    }
    return t
  }
}
