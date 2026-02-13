/**
 * DataTable 类 - 数据表
 * 继承 DataView，实现 IDataTable 接口
 * 相当于 .NET 的 DataTable - 结构层
 */

import { DataView } from './data-view'
import { FIELD_METADATA } from '@spark-view/spark-utils'
import type { Provider as CapabilityProvider, CapabilityKey } from '@spark-view/spark-utils'
import type {
  IDataTable,
  ITableMetadata,
  IViewMetadata,
  IDataRowWithPermission,
  DataColumn,
  CrudApi,
  IDataSet,
  FilterExpression,
  SortExpression
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
    
    // 设置自引用（让默认上下文能够调用表层方法）
    this.setDataTable(this)
  }

  // ==================== 主动请求能力实现 ====================
  
  /**
   * 为视图加载数据（表层实现）
   * 执行网络请求，使用 CrudApi 配置和视图提供的参数
   * 
   * @param _view 请求数据的视图（待 HTTP 客户端集成时使用）
   * @param params 请求参数（page, pageSize, filter, sort）
   */
  async loadForView(
    _view: DataView,
    params: {
      page: number
      pageSize: number
      filter?: FilterExpression
      sort?: SortExpression
    }
  ): Promise<void> {
    if (!this.api?.list) {
      this.logger.warn(`⚠️ [DataTable] ${this.tableName} 未配置 list API，无法加载数据`)
      return
    }
    
    const listApi = this.api.list
    
    try {
      // 构建请求参数
      const requestParams: Record<string, unknown> = {}
      
      // 分页参数
      const pageParam = listApi.pagination?.pageParam ?? 'page'
      const sizeParam = listApi.pagination?.sizeParam ?? 'pageSize'
      const sortParam = listApi.pagination?.sortParam ?? 'sort'
      
      requestParams[pageParam] = params.page
      requestParams[sizeParam] = params.pageSize
      
      // 排序参数
      if (params.sort) {
        requestParams[sortParam] = params.sort
      }
      
      // 过滤参数
      if (params.filter) {
        // TODO: 根据后端格式转换 filterExpression
        requestParams['filter'] = params.filter
      }
      
      this.logger.info(`🌐 [DataTable] ${this.tableName} 发起网络请求`, { 
        url: listApi.url, 
        method: listApi.method,
        params: requestParams 
      })
      
      // TODO: 这里需要实际的 HTTP 请求实现
      // 暂时抛出错误提示需要集成 HTTP 客户端
      throw new Error(`DataTable.loadForView() 需要集成 HTTP 客户端才能执行实际请求。请在 DataSet 或应用层注入 HTTP 客户端。`)
      
      // 预期的实现：
      // const response = await httpClient.request({
      //   url: listApi.url,
      //   method: listApi.method || 'GET',
      //   params: requestParams
      // })
      // 
      // // 填充视图数据
      // view.rows = response.data.rows || []
      // view.total = response.data.total || 0
      // 
      // this.logger.info(`✅ [DataTable] ${this.tableName} 数据加载成功，${view.rows.length} 行`)
      
    } catch (error) {
      this.logger.error(`❌ [DataTable] ${this.tableName} 数据加载失败`, error)
      throw error
    }
  }
  
  /**
   * 保存数据（表层实现）
   * 执行网络请求，使用 CrudApi 配置
   * 
   * @param row 要保存的行数据
   */
  async saveRow(row: IDataRowWithPermission): Promise<void> {
    // 判断是新增还是更新
    const isNew = !('id' in row && row.id) // 简单判断，实际可能需要更复杂的逻辑
    const api = isNew ? this.api?.create : this.api?.update
    
    if (!api) {
      this.logger.warn(`⚠️ [DataTable] ${this.tableName} 未配置 ${isNew ? 'create' : 'update'} API，无法保存数据`)
      return
    }
    
    try {
      this.logger.info(`💾 [DataTable] ${this.tableName} 发起保存请求`, { 
        url: api.url, 
        method: api.method,
        isNew 
      })
      
      // TODO: 这里需要实际的 HTTP 请求实现
      throw new Error(`DataTable.saveRow() 需要集成 HTTP 客户端才能执行实际请求。请在 DataSet 或应用层注入 HTTP 客户端。`)
      
      // 预期的实现：
      // const response = await httpClient.request({
      //   url: api.url,
      //   method: api.method || (isNew ? 'POST' : 'PUT'),
      //   data: row
      // })
      // 
      // this.logger.info(`✅ [DataTable] ${this.tableName} 数据保存成功`)
      // 
      // // 可选：重新加载数据
      // // await this.loadForView(this, { page: this.page, pageSize: this.pageSize })
      
    } catch (error) {
      this.logger.error(`❌ [DataTable] ${this.tableName} 数据保存失败`, error)
      throw error
    }
  }

  // ==================== 工具方法 ====================

  // ==================== 能力注册 ====================
  
  /**
   * 获取表层能力列表
   * 
   * 表层提供的能力：
   * - FIELD_METADATA: 字段元数据（列定义、字段类型等）
   * - 继承 DataView 的能力（DATA_SOURCE, SELECTION）
   * 
   * @returns 能力 Map（合并视图层 + 表层）
   */
  override getCapabilities(): Map<CapabilityKey<unknown>, CapabilityProvider> {
    // 继承视图层能力
    const capabilities = super.getCapabilities()
    
    // 表层能力: 字段元数据
    const fieldMetadata: Record<string, {
      label: string
      type?: string
      [key: string]: unknown
    }> = {}
    for (const col of this.columns) {
      fieldMetadata[col.name] = {
        label: col.label ?? col.name,
        type: col.type,
        isPrimaryKey: col.isPrimaryKey,
        allowDBNull: col.allowDBNull,
        defaultValue: col.defaultValue
      }
    }
    capabilities.set(FIELD_METADATA as CapabilityKey<unknown>, {
      name: FIELD_METADATA,
      implementation: fieldMetadata
    })
    
    return capabilities
  }

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
      // 设置 DataTable 引用，让上下文能够主动请求数据
      const context = this.contexts[contextId]
      if (context) {
        context.setDataTable(this)
      }
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

    // 新格式：Record
    if (data.contexts) {
      Object.entries(data.contexts).forEach(([contextId, ctxData]) => {
        table.contexts[contextId] = DataView.fromData(
          ctxData,
          table.tableName,
          contextId,
          dataSet
        )
      })
    }

    return table
  }
}
