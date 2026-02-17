/**
 * DataTable — 数据表（表结构 + 视图管理 + CRUD）
 *
 * SPARK 能力系统模式（与组件系统同构）：
 *   - 实现 ICapabilityContext → parent 链：DataTable → DataSet
 *   - 提供 DATA_TABLE 能力
 *   - 视图管理：创建视图时设置 parent 链并触发 setupCascade
 *
 * 【重要】DataTable 不暴露任何 UI 状态代理。
 */

import { DataView } from './data-view'
import { CrudService, createCrudService } from './crud-service'
import { DATA_TABLE, Logger, provide as setCapability } from '@spark-view/spark-utils'
import type { CapabilityName, ICapabilityContext } from '@spark-view/spark-utils'
import type { IDataRow, DataColumn, CrudApi, ITableMetadata, QueryParams, CrudResult, BatchResult, IViewMetadata } from './types'
import type { TreeManager } from './tree-manager'

// ===== 能力接口（与类共同定义，避免循环引用） =====

/** DataTable 向能力系统暴露的能力（仅表结构，不含 UI 状态） */
export interface IDataTableCapability {
  readonly dataTable: DataTable
}

export class DataTable implements ICapabilityContext {
  // ===== ICapabilityContext =====

  /** 唯一标识 */
  id: string

  /** 上下文类型 */
  readonly type = 'datatable'

  /** 父级上下文（DataSet），由 DataSet 在构建时设置 */
  parent?: ICapabilityContext

  /** 能力 Map */
  capabilities = new Map<CapabilityName, unknown>()

  // ===== 表元数据 =====

  /** 表名 */
  tableName: string

  /** 列定义 */
  columns: DataColumn[]

  /** CRUD API配置 */
  api?: CrudApi

  // ===== 视图容器 =====

  /** 视图集合（包含 'default'） */
  views: Record<string, DataView> = {}

  // ===== 内部 =====

  /** CRUD服务实例 */
  private crudService?: CrudService

  /** 日志 */
  private logger = Logger('DataTable')

  // ===== 构造函数 =====

  constructor(tableName: string, columns: DataColumn[] = []) {
    this.tableName = tableName
    this.id = `dt:${tableName}`
    this.columns = columns
    this.views['default'] = new DataView(tableName, 'default')
    this.initializeCrudService()

    // 注册 DATA_TABLE 能力
    const table = this
    setCapability(this, DATA_TABLE, {
      get dataTable() { return table }
    } satisfies IDataTableCapability)
  }

  // ===== DataSet 关联（设置 parent 链） =====

  /**
   * 关联 DataSet
   *
   * DataTable 作为视图管理者：
   * - 设置 parent 链（parent = DataSet 的 ICapabilityContext）
   * - 为所有视图设置 parent = this，使视图能通过 lookup 消费上层能力
   * - 触发视图的 setupCascade()
   */
  setDataSet(ds: ICapabilityContext): void {
    this.parent = ds
    // 统一设置所有视图的 parent 链并建立级联订阅
    for (const view of Object.values(this.views)) {
      view.parent = this
      view.setupCascade()
    }
  }

  getDataSet(): ICapabilityContext | undefined {
    return this.parent
  }

  // ===== 视图管理 =====

  /**
   * 获取或创建视图（统一管理，'default' 与命名视图一视同仁）
   * @param viewId 视图ID
   */
  getOrCreateView(viewId: string): DataView {
    if (!this.views[viewId]) {
      const view = new DataView(this.tableName, viewId)
      // 视图管理职责：设置 parent 链并触发级联
      if (this.parent) {
        view.parent = this
        view.setupCascade()
      }
      this.views[viewId] = view
    }
    return this.views[viewId]
  }

  /**
   * 刷新命名视图数据（从 default 视图同步到其它视图）
   */
  refreshAllViews(): void {
    const def = this.views['default']
    const src = def.originalRows ?? def.rows ?? []
    for (const [id, view] of Object.entries(this.views)) {
      if (id === 'default') continue
      if (view.originalRows) view.rows.splice(0, view.rows.length, ...view.originalRows)
      else view.rows.splice(0, view.rows.length, ...src)
    }
  }

  /**
   * 通知视图订阅者（DataSet 委托入口）
   * @param viewId 不指定则广播所有视图
   */
  notifySubscribers(viewId?: string): void {
    if (viewId !== undefined) {
      const view = this.getOrCreateView(viewId)
      view.notifySubscribers()
      return
    }
    // 广播：先刷新命名视图 → 统一通知
    this.refreshAllViews()
    for (const view of Object.values(this.views)) view.notifySubscribers()
  }

  /**
   * 检查是否有订阅者（DataSet 委托入口）
   */
  hasSubscribers(viewId?: string): boolean {
    if (viewId !== undefined) {
      const v = this.views[viewId]
      return v?.hasSubscribers() ?? false
    }
    for (const view of Object.values(this.views)) if (view.hasSubscribers()) return true
    return false
  }

  /**
   * 重置所有视图状态
   */
  resetAllViews(): void {
    for (const view of Object.values(this.views)) view.resetState()
  }

  /**
   * 清理所有视图的无效选中状态
   */
  cleanupAllViews(): boolean {
    let cleaned = false
    for (const view of Object.values(this.views)) cleaned = view.cleanupInvalidSelections() || cleaned
    return cleaned
  }

  /** 委托到 views['default'] */
  setTreeManager(tm: TreeManager): void { this.views['default'].setTreeManager(tm) }
  getTreeManager(): TreeManager | undefined { return this.views['default'].getTreeManager() }

  // ===== CRUD 服务 =====

  private initializeCrudService(): void { if (this.api) this.crudService = createCrudService(this.api) }
  setApi(api: CrudApi): void { this.api = api; this.initializeCrudService() }

  /**
   * CRUD 后通知：广播所有视图订阅者
   */
  private notifyTableChanged(): void {
    this.notifySubscribers()
  }

  // ===== 网络CRUD（操作 views['default'] 数据） =====

  async loadFromServer(params?: QueryParams, config?: import('./types').CrudOperationConfig): Promise<CrudResult> {
    if (!this.crudService) throw new Error(`Table ${this.tableName} has no API configuration`)
    const view = this.views['default']
    view.setLoading()
    try {
      const result = await this.crudService.list(params, config)
      if (result.success && result.data) {
        const data = result.data as { rows?: IDataRow[]; total?: number; page?: number; pageSize?: number }
        if (data.rows) {
          view.rows = data.rows
          view.total = data.total ?? 0
          view.page = data.page ?? 1
          view.pageSize = data.pageSize ?? 20
        } else if (Array.isArray(data)) {
          view.rows = data
        }
        this.notifyTableChanged()
      }
      return result
    } catch (error) {
      view.setError(error as Error)
      throw error
    } finally {
      view.setReady()
    }
  }

  async createRecord(data: Partial<IDataRow>, config?: import('./types').CrudOperationConfig): Promise<CrudResult<IDataRow>> {
    if (!this.crudService) throw new Error(`Table ${this.tableName} has no API configuration`)
    const result = await this.crudService.create<IDataRow>(data, config)
    if (result.success && result.data) {
      this.views['default'].rows.push(result.data)
      this.notifyTableChanged()
    }
    return result
  }

  async updateRecord(id: string | number, data: Partial<IDataRow>, config?: import('./types').CrudOperationConfig): Promise<CrudResult<IDataRow>> {
    if (!this.crudService) throw new Error(`Table ${this.tableName} has no API configuration`)
    const result = await this.crudService.update<IDataRow>(id, data, config)
    if (result.success && result.data) {
      const index = this.views['default'].rows.findIndex(row => row['id'] === id)
      if (index >= 0) {
        this.views['default'].rows[index] = { ...this.views['default'].rows[index], ...result.data }
        this.notifyTableChanged()
      }
    }
    return result
  }

  async deleteRecord(id: string | number, config?: import('./types').CrudOperationConfig): Promise<CrudResult<boolean>> {
    if (!this.crudService) throw new Error(`Table ${this.tableName} has no API configuration`)
    const result = await this.crudService.delete(id, config)
    if (result.success) {
      const index = this.views['default'].rows.findIndex(row => row['id'] === id)
      if (index >= 0) this.views['default'].rows.splice(index, 1)
      this.notifyTableChanged()
    }
    return result
  }

  async batchCreateRecords(items: Partial<IDataRow>[], config?: import('./types').CrudOperationConfig): Promise<CrudResult<BatchResult>> {
    if (!this.crudService) throw new Error(`Table ${this.tableName} has no API configuration`)
    const result = await this.crudService.batchCreate<IDataRow>(items, config)
    if (result.success && result.data) {
      for (const itemResult of result.data.results) {
        if (itemResult.success && itemResult.data) this.views['default'].rows.push(itemResult.data as IDataRow)
      }
      this.notifyTableChanged()
    }
    return result
  }

  async batchUpdateRecords(items: Array<{ id: string | number } & Partial<IDataRow>>, config?: import('./types').CrudOperationConfig): Promise<CrudResult<BatchResult>> {
    if (!this.crudService) throw new Error(`Table ${this.tableName} has no API configuration`)
    const result = await this.crudService.batchUpdate<IDataRow>(items, config)
    if (result.success && result.data) {
      for (const itemResult of result.data.results) {
        if (itemResult.success && itemResult.data) {
          const record = itemResult.data as IDataRow
          const index = this.views['default'].rows.findIndex(row => row['id'] === (record as { id?: unknown }).id)
          if (index >= 0) this.views['default'].rows[index] = { ...this.views['default'].rows[index], ...record }
        }
      }
      this.notifyTableChanged()
    }
    return result
  }

  async batchDeleteRecords(ids: Array<string | number>, config?: import('./types').CrudOperationConfig): Promise<CrudResult<BatchResult>> {
    if (!this.crudService) throw new Error(`Table ${this.tableName} has no API configuration`)
    const result = await this.crudService.batchDelete(ids, config)
    if (result.success && result.data) {
      for (const id of ids) {
        const index = this.views['default'].rows.findIndex(row => row['id'] === id)
        if (index >= 0) this.views['default'].rows.splice(index, 1)
      }
      this.notifyTableChanged()
    }
    return result
  }

  async importData(file: File): Promise<CrudResult<{ imported: number; failed: number }>> {
    if (!this.crudService) throw new Error(`Table ${this.tableName} has no API configuration`)
    const result = await this.crudService.importData(file)
    if (result.success) {
      await this.loadFromServer()
      this.notifyTableChanged()
    }
    return result
  }

  async exportData(params?: QueryParams): Promise<CrudResult<Blob>> {
    if (!this.crudService) throw new Error(`Table ${this.tableName} has no API configuration`)
    return await this.crudService.exportData(params)
  }

  // ===== 序列化 =====

  toData(): ITableMetadata {
    const viewsData: Record<string, IViewMetadata> = {}
    for (const [id, view] of Object.entries(this.views)) {
      if (id === 'default') continue
      viewsData[id] = view.toData()
    }

    const def = this.views['default'].toData()
    return {
      tableName: this.tableName,
      columns: this.columns,
      viewId: def.viewId,
      views: viewsData,
      api: this.api,
      loading: this.views['default'].isLoading || undefined,
      error: this.views['default'].loadingError?.message,
      rows: def.rows,
      filterExpression: def.filterExpression,
      sortExpression: def.sortExpression,
      autoSelectFirst: def.autoSelectFirst,
      page: def.page,
      pageSize: def.pageSize,
    }
  }

  // ===== 工厂方法 =====

  static fromTableData(data: ITableMetadata): DataTable {
    const t = new DataTable(data.tableName, data.columns ?? [])
    if (data.api !== undefined) t.api = data.api

    const def = t.views['default']
    if (data.rows) def.rows = [...data.rows]
    if (data.filterExpression !== undefined) def.filterExpression = data.filterExpression
    if (data.sortExpression !== undefined) def.sortExpression = data.sortExpression
    if (data.autoSelectFirst !== undefined) def.autoSelectFirst = data.autoSelectFirst
    def.page = data.page ?? 1
    def.pageSize = data.pageSize ?? 20

    if (data.views) {
      for (const [cid, cd] of Object.entries(data.views)) {
        if (cid === 'default') continue
        t.views[cid] = DataView.fromData(cd, t.tableName, cid)
      }
    }
    return t
  }
}
