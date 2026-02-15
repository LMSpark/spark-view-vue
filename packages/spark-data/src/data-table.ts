/**
 * DataTable — 数据表（结构 + 多视图管理）
 *
 * 继承 DataView 作为默认视图，管理额外的命名数据视图。
 * 提供完整的CRUD操作、数据视图管理、序列化等功能。
 */

import { DataView } from './data-view'
import { CrudService, createCrudService } from './crud-service'
import { DATA_TABLE } from '@spark-view/spark-utils'
import type { Provider as CapabilityProvider, CapabilityKey } from '@spark-view/spark-utils'
import type { IDataRow, DataColumn, CrudApi, ITableMetadata, QueryParams, CrudResult, BatchResult } from './types'

export class DataTable extends DataView {
  // ===== 属性定义 =====

  /** 列定义 */
  columns: DataColumn[]

  /** CRUD API配置 */
  api?: CrudApi

  /** 命名数据视图集合（除默认视图外的额外视图） */
  contexts: Record<string, DataView> = {}

  /** CRUD服务实例 */
  private crudService?: CrudService

  // ===== 构造函数 =====

  /**
   * 创建数据表实例
   * @param tableName 表名
   * @param columns 列定义数组
   */
  constructor(tableName: string, columns: DataColumn[] = []) {
    super(tableName, 'default')
    this.columns = columns
    this.initializeCrudService()
  }

  // ===== 事件管理 =====

  /**
   * 发送事件（DataTable级别事件）
   * 如果有关联的dataSet，通过dataSet发送事件，否则记录日志
   * @param event 事件名称
   * @param data 事件数据
   */
  emit(event: string, data: unknown): void {
    if (this.dataSet) {
      this.dataSet.emit(event, data)
    } else {
      this.logger.info(`Event: ${event}`, data)
    }
  }

  // ===== 能力注册 =====

  /**
   * 获取能力提供者映射（供 CapabilityManager 调用）
   * 注册字段元数据能力，提供列的类型、标签、主键等信息
   * @returns 能力提供者映射
   */
  getCapabilities(): Map<CapabilityKey<unknown>, CapabilityProvider> {
    const caps = new Map<CapabilityKey<unknown>, CapabilityProvider>()

    // 构建字段元数据
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

    caps.set(DATA_TABLE as CapabilityKey<unknown>, {
      name: DATA_TABLE,
      implementation: {
        dataTable: this
      },
    })

    return caps
  }

  // ===== 数据视图管理 =====

  /**
   * 获取或创建命名数据视图
   * @param contextId 数据视图ID，'default'返回自身
   * @returns 数据视图实例
   */
  getOrCreateContext(contextId: string): DataView {
    if (contextId === 'default') return this
    this.contexts[contextId] ??= new DataView(this.tableName, contextId, this.dataSet)
    return this.contexts[contextId] as DataView
  }

  /**
   * 把原始数据重新分发到所有子数据视图
   * 子数据视图的数据来源是表的原始数据，实际过滤由后端完成
   */
  refreshAllContexts(): void {
    const src = this.originalRows ?? this.rows ?? []
    for (const ctx of Object.values(this.contexts)) {
      if (ctx.originalRows) {
        ctx.rows.splice(0, ctx.rows.length, ...ctx.originalRows)
      } else {
        ctx.rows.splice(0, ctx.rows.length, ...src)
      }
    }
  }

  // ===== 序列化 =====

  /**
   * 序列化为元数据对象
   * @returns 表元数据
   */
  override toData(): ITableMetadata {
    const ctxData: Record<string, import('./types').IViewMetadata> = {}
    for (const [id, ctx] of Object.entries(this.contexts)) {
      ctxData[id] = ctx.toData()
    }
    const result: ITableMetadata = {
      tableName: this.tableName,
      columns: this.columns,
      contextId: this.contextId,
      contexts: ctxData,
      api: this.api,
      loading: this.isLoading,
      error: this.loadingError ? String(this.loadingError.message) : undefined,
      rows: this.rows,
      filterExpression: this.filterExpression,
      sortExpression: this.sortExpression,
      autoSelectFirst: this.autoSelectFirst,
      page: this.page,
      pageSize: this.pageSize,
    }

    return result
  }

  // ===== CRUD服务管理 =====

  /**
   * 初始化CRUD服务
   * 根据API配置创建CRUD服务实例
   */
  private initializeCrudService(): void {
    if (this.api) {
      this.crudService = createCrudService(this.api)
    }
  }

  /**
   * 更新API配置
   * @param api 新的CRUD API配置
   */
  setApi(api: CrudApi): void {
    this.api = api
    this.initializeCrudService()
  }

  // ===== 网络CRUD操作 =====

  /**
   * 从服务器加载数据
   * @param params 查询参数
   * @param config CRUD操作配置（包含权限快照）
   * @returns CRUD操作结果
   */
  async loadFromServer(params?: QueryParams, config?: import('./types').CrudOperationConfig): Promise<CrudResult> {
    if (!this.crudService) {
      throw new Error(`Table ${this.tableName} has no API configuration`)
    }

    this.isLoading = true
    try {
      const result = await this.crudService.list(params, config)
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
   * @param data 记录数据
   * @param config CRUD操作配置（包含权限快照）
   * @returns CRUD操作结果
   */
  async createRecord(data: Partial<IDataRow>, config?: import('./types').CrudOperationConfig): Promise<CrudResult<IDataRow>> {
    if (!this.crudService) {
      throw new Error(`Table ${this.tableName} has no API configuration`)
    }

    const result = await this.crudService.create<IDataRow>(data, config)
    if (result.success && result.data) {
      this.rows.push(result.data)
      this.emit('recordCreated', { tableName: this.tableName, record: result.data })
    }
    return result
  }

  /**
   * 更新记录
   * @param id 记录ID
   * @param data 更新数据
   * @param config CRUD操作配置（包含权限快照）
   * @returns CRUD操作结果
   */
  async updateRecord(id: string | number, data: Partial<IDataRow>, config?: import('./types').CrudOperationConfig): Promise<CrudResult<IDataRow>> {
    if (!this.crudService) {
      throw new Error(`Table ${this.tableName} has no API configuration`)
    }

    const result = await this.crudService.update<IDataRow>(id, data, config)
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
   * @param id 记录ID
   * @param config CRUD操作配置（包含权限快照）
   * @returns CRUD操作结果
   */
  async deleteRecord(id: string | number, config?: import('./types').CrudOperationConfig): Promise<CrudResult<boolean>> {
    if (!this.crudService) {
      throw new Error(`Table ${this.tableName} has no API configuration`)
    }

    const result = await this.crudService.delete(id, config)
    if (result.success) {
      const index = this.rows.findIndex(row => row['id'] === id)
      if (index >= 0) {
        this.rows.splice(index, 1)
        this.emit('recordDeleted', { tableName: this.tableName, id })
      }
    }
    return result
  }

  // ===== 批量CRUD操作 =====

  /**
   * 批量创建记录
   * @param items 记录数据数组
   * @param config CRUD操作配置（包含权限快照）
   * @returns 批量操作结果
   */
  async batchCreateRecords(items: Partial<IDataRow>[], config?: import('./types').CrudOperationConfig): Promise<CrudResult<BatchResult>> {
    if (!this.crudService) {
      throw new Error(`Table ${this.tableName} has no API configuration`)
    }

    const result = await this.crudService.batchCreate<IDataRow>(items, config)
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
   * @param items 包含ID的更新数据数组
   * @param config CRUD操作配置（包含权限快照）
   * @returns 批量操作结果
   */
  async batchUpdateRecords(items: Array<{ id: string | number } & Partial<IDataRow>>, config?: import('./types').CrudOperationConfig): Promise<CrudResult<BatchResult>> {
    if (!this.crudService) {
      throw new Error(`Table ${this.tableName} has no API configuration`)
    }

    const result = await this.crudService.batchUpdate<IDataRow>(items, config)
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
   * @param ids 记录ID数组
   * @param config CRUD操作配置（包含权限快照）
   * @returns 批量操作结果
   */
  async batchDeleteRecords(ids: Array<string | number>, config?: import('./types').CrudOperationConfig): Promise<CrudResult<BatchResult>> {
    if (!this.crudService) {
      throw new Error(`Table ${this.tableName} has no API configuration`)
    }

    const result = await this.crudService.batchDelete(ids, config)
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

  // ===== 数据导入导出 =====

  /**
   * 导入数据
   * @param file 上传的文件
   * @returns 导入结果
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
   * @param params 导出参数
   * @returns 导出结果（Blob）
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

  /**
   * 从表元数据创建DataTable实例
   * @param data 表元数据
   * @returns DataTable实例
   */
  static fromTableData(data: ITableMetadata): DataTable {
    const t = new DataTable(data.tableName, data.columns ?? [])
    if (data.api !== undefined) t.api = data.api
    if (data.rows) {
      t.rows = [...data.rows]
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
