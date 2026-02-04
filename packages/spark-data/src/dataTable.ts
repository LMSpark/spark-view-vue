/**
 * DataTable 类 - 数据表
 * 继承 BindingContext，实现 IDataTable 接口
 * 相当于 .NET 的 DataTable - 结构层
 */

import { BindingContext } from './bindingContext'
import type { 
  IDataTable, 
  IDataTableWithApi,
  IBindingContext, 
  DataColumn, 
  CrudApi, 
  IDataSet,
  IApiAdapter,
  DataRow
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
  
  // API 适配器（注入）
  private apiAdapter?: IApiAdapter

  constructor(
    tableName: string,
    columns: DataColumn[] = [],
    dataSet?: IDataSet,
    apiAdapter?: IApiAdapter
  ) {
    super(tableName, 'default', dataSet)
    this.tableName = tableName
    this.columns = columns
    this.apiAdapter = apiAdapter
  }
  
  /**
   * 设置 API 适配器（由 DataSet 或应用层注入）
   */
  setApiAdapter(adapter: IApiAdapter): void {
    this.apiAdapter = adapter
  }
  
  // ==================== CRUD 方法 ====================
  
  /**
   * 列表查询
   */
  async list(params?: Record<string, unknown>): Promise<DataRow[]> {
    if (!this.api?.list) {
      throw new Error(`表 ${this.tableName} 未配置 list API`)
    }
    
    if (!this.apiAdapter) {
      throw new Error('未注入 ApiAdapter，无法执行 API 调用')
    }
    
    this.loading = true
    this.error = undefined
    
    try {
      const data = await this.apiAdapter.execute<DataRow[]>(this.api.list, params)
      
      // 自动更新表数据
      this.rows.splice(0, this.rows.length, ...data)
      this['__originalRows'] = [...data]  // 使用私有字段访问器
      
      console.info(`✅ [DataTable] ${this.tableName}.list() 成功，共 ${data.length} 行`)
      
      return data
    } catch (error) {
      this.error = (error as Error).message
      console.error(`❌ [DataTable] ${this.tableName}.list() 失败`, error)
      throw error
    } finally {
      this.loading = false
    }
  }
  
  /**
   * 创建记录
   */
  async create(data: DataRow): Promise<DataRow> {
    if (!this.api?.create) {
      throw new Error(`表 ${this.tableName} 未配置 create API`)
    }
    
    if (!this.apiAdapter) {
      throw new Error('未注入 ApiAdapter，无法执行 API 调用')
    }
    
    this.loading = true
    this.error = undefined
    
    try {
      const result = await this.apiAdapter.execute<DataRow>(this.api.create, data)
      
      // 自动添加到表
      this.rows.push(result)
      const originalRows = this['__originalRows']
      if (originalRows) {
        originalRows.push(result)
      }
      
      console.info(`✅ [DataTable] ${this.tableName}.create() 成功`)
      
      return result
    } catch (error) {
      this.error = (error as Error).message
      console.error(`❌ [DataTable] ${this.tableName}.create() 失败`, error)
      throw error
    } finally {
      this.loading = false
    }
  }
  
  /**
   * 更新记录
   */
  async update(id: string | number, data: Partial<DataRow>): Promise<DataRow> {
    if (!this.api?.update) {
      throw new Error(`表 ${this.tableName} 未配置 update API`)
    }
    
    if (!this.apiAdapter) {
      throw new Error('未注入 ApiAdapter，无法执行 API 调用')
    }
    
    this.loading = true
    this.error = undefined
    
    try {
      const result = await this.apiAdapter.execute<DataRow>(this.api.update, { id, ...data })
      
      // 自动更新表中的记录
      const index = this.rows.findIndex(r => r.id === id)
      if (index > -1) {
        Object.assign(this.rows[index], result)
      }
      
      const originalRows = this['__originalRows']
      if (originalRows) {
        const cacheIndex = originalRows.findIndex(r => r.id === id)
        if (cacheIndex > -1) {
          Object.assign(originalRows[cacheIndex], result)
        }
      }
      
      console.info(`✅ [DataTable] ${this.tableName}.update() 成功`)
      
      return result
    } catch (error) {
      this.error = (error as Error).message
      console.error(`❌ [DataTable] ${this.tableName}.update() 失败`, error)
      throw error
    } finally {
      this.loading = false
    }
  }
  
  /**
   * 删除记录
   */
  async delete(id: string | number): Promise<boolean> {
    if (!this.api?.delete) {
      throw new Error(`表 ${this.tableName} 未配置 delete API`)
    }
    
    if (!this.apiAdapter) {
      throw new Error('未注入 ApiAdapter，无法执行 API 调用')
    }
    
    this.loading = true
    this.error = undefined
    
    try {
      await this.apiAdapter.execute(this.api.delete, { id })
      
      // 自动从表中删除
      const index = this.rows.findIndex(r => r.id === id)
      if (index > -1) {
        this.rows.splice(index, 1)
      }
      
      const originalRows = this['__originalRows']
      if (originalRows) {
        const cacheIndex = originalRows.findIndex(r => r.id === id)
        if (cacheIndex > -1) {
          originalRows.splice(cacheIndex, 1)
        }
      }
      
      console.info(`✅ [DataTable] ${this.tableName}.delete() 成功`)
      
      return true
    } catch (error) {
      this.error = (error as Error).message
      console.error(`❌ [DataTable] ${this.tableName}.delete() 失败`, error)
      throw error
    } finally {
      this.loading = false
    }
  }
  
  /**
   * 批量创建
   */
  async batchCreate(data: DataRow[]): Promise<DataRow[]> {
    if (!this.api?.batch?.create) {
      throw new Error(`表 ${this.tableName} 未配置 batch.create API`)
    }
    
    if (!this.apiAdapter) {
      throw new Error('未注入 ApiAdapter，无法执行 API 调用')
    }
    
    this.loading = true
    this.error = undefined
    
    try {
      const result = await this.apiAdapter.execute<DataRow[]>(this.api.batch.create, { items: data })
      
      // 自动添加到表
      this.rows.push(...result)
      const originalRows = this['__originalRows']
      if (originalRows) {
        originalRows.push(...result)
      }
      
      console.info(`✅ [DataTable] ${this.tableName}.batchCreate() 成功，共 ${result.length} 条`)
      
      return result
    } catch (error) {
      this.error = (error as Error).message
      console.error(`❌ [DataTable] ${this.tableName}.batchCreate() 失败`, error)
      throw error
    } finally {
      this.loading = false
    }
  }
  
  /**
   * 批量更新
   */
  async batchUpdate(updates: Array<{ id: string | number; data: Partial<DataRow> }>): Promise<DataRow[]> {
    if (!this.api?.batch?.update) {
      throw new Error(`表 ${this.tableName} 未配置 batch.update API`)
    }
    
    if (!this.apiAdapter) {
      throw new Error('未注入 ApiAdapter，无法执行 API 调用')
    }
    
    this.loading = true
    this.error = undefined
    
    try {
      const result = await this.apiAdapter.execute<DataRow[]>(this.api.batch.update, { items: updates })
      
      // 自动更新表中的记录
      result.forEach(updated => {
        const index = this.rows.findIndex(r => r.id === updated.id)
        if (index > -1) {
          Object.assign(this.rows[index], updated)
        }
        
        const originalRows = this['__originalRows']
        if (originalRows) {
          const cacheIndex = originalRows.findIndex(r => r.id === updated.id)
          if (cacheIndex > -1) {
            Object.assign(originalRows[cacheIndex], updated)
          }
        }
      })
      
      console.info(`✅ [DataTable] ${this.tableName}.batchUpdate() 成功，共 ${result.length} 条`)
      
      return result
    } catch (error) {
      this.error = (error as Error).message
      console.error(`❌ [DataTable] ${this.tableName}.batchUpdate() 失败`, error)
      throw error
    } finally {
      this.loading = false
    }
  }
  
  /**
   * 批量删除
   */
  async batchDelete(ids: Array<string | number>): Promise<boolean> {
    if (!this.api?.batch?.delete) {
      throw new Error(`表 ${this.tableName} 未配置 batch.delete API`)
    }
    
    if (!this.apiAdapter) {
      throw new Error('未注入 ApiAdapter，无法执行 API 调用')
    }
    
    this.loading = true
    this.error = undefined
    
    try {
      await this.apiAdapter.execute(this.api.batch.delete, { ids })
      
      // 自动从表中删除
      ids.forEach(id => {
        const index = this.rows.findIndex(r => r.id === id)
        if (index > -1) {
          this.rows.splice(index, 1)
        }
        
        const originalRows = this['__originalRows']
        if (originalRows) {
          const cacheIndex = originalRows.findIndex(r => r.id === id)
          if (cacheIndex > -1) {
            originalRows.splice(cacheIndex, 1)
          }
        }
      })
      
      console.info(`✅ [DataTable] ${this.tableName}.batchDelete() 成功，共 ${ids.length} 条`)
      
      return true
    } catch (error) {
      this.error = (error as Error).message
      console.error(`❌ [DataTable] ${this.tableName}.batchDelete() 失败`, error)
      throw error
    } finally {
      this.loading = false
    }
  }
  
  // ==================== 原有方法 ====================

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
        console.info(`🔄 [DataTable] 刷新上下文: ${this.tableName}.${context.contextId}`);
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
    table['__originalRows'] = data._originalRows  // 直接访问私有字段
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
