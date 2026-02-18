/**
 * DataView — 数据视图（统一交互枢纽）
 *
 * SPARK 能力系统模式（与组件系统同构）：
 *   - 实现 ICapabilityContext → parent 链：DataView → DataTable → DataSet
 *   - lookup(this, DATA_SET) 消费上层能力
 *   - events.emit('stateChanged', ...) 供子视图级联 + DataSet 状态观察
 *
 * 提供：DATA_VIEW 能力、subscribe()、events 'stateChanged'
 * 消费：DATA_SET（查询关系）
 *
 * 级联（完全 SOLID）：
 *   子视图 setupCascade() 订阅父视图 stateChanged 事件。
 *   父不知道子、不操作子。
 */

import type { IDataRow, IViewMetadata, FilterExpression, SortExpression, ViewStateEvent, DataRelation, CrudOperationConfig, QueryParams, CrudResult, BatchResult, IDataSource, IModelPermission } from './types'
import type { TreeManager } from './tree-manager'
import { Logger, DATA_VIEW, DATA_SET, DATA_TABLE, provide as setCapability, lookup, createEventEmitter } from '@spark-view/spark-utils'
import type { CapabilityName, ICapabilityContext, IEventEmitter } from '@spark-view/spark-utils'
import { isSameRow, getParentRows } from './core/utils'
import { CrudService, createCrudService } from './crud-service'
import type { IDataTableCapability } from './data-table'

// ===== 能力接口（与类共同定义，避免循环引用） =====

/** DataView 向 UI/组件暴露的能力 */
export interface IDataViewCapability {
  /** DataView 实例引用 */
  readonly dataView: DataView
  /** 表名 */
  readonly tableName: string
  /** 视图ID */
  readonly viewId: string
  /** 当前行数据（响应式 getter） */
  readonly rows: IDataRow[]
  /** 当前选中行（响应式 getter） */
  readonly currentRow: IDataRow | null
}

export class DataView implements ICapabilityContext, IDataSource {
  // ===== ICapabilityContext =====

  /** 唯一标识 */
  id: string

  /** 上下文类型 */
  readonly type = 'dataview'

  /** 父级上下文（DataTable），由 DataTable 在创建视图时设置 */
  parent?: ICapabilityContext

  /** 能力 Map */
  capabilities = new Map<CapabilityName, unknown>()

  // ===== 属性定义 =====

  /** 表名 */
  tableName: string

  /** 数据视图ID */
  viewId: string

  // ===== 数据状态 =====

  /** 当前显示的数据行 */
  rows: IDataRow[] = []

  /** 原始数据行（用于过滤和排序的基础数据） */
  originalRows?: IDataRow[]

  /** 当前选中行 */
  currentRow: IDataRow | null = null

  /** 模型级权限（可选，IDataSource 兼容字段） */
  _modelPerm?: IModelPermission

  /** 当前选中行索引 */
  currentRowIndex: number | null = null

  /** 选中的多行数据 */
  selectedRows: IDataRow[] = []

  /** 选中的行索引数组 */
  selectedRowIndices: number[] = []

  // ===== 分页状态 =====

  /** 总记录数 */
  total: number = 0

  /** 当前页码 */
  page: number = 1

  /** 每页大小 */
  pageSize: number = 20

  // ===== 加载状态 =====

  /** 是否正在加载 */
  isLoading: boolean = false

  /** 加载错误信息 */
  loadingError: Error | null = null

  /**
   * 请求状态：0=未请求, 1=请求中, 2=已完成, 3=失败
   * - 用于 DataSet 的调度器判断依赖/去重
   */
  requestState: 0 | 1 | 2 | 3 = 0

  // ===== 视图配置 =====

  /** 过滤表达式 */
  filterExpression?: FilterExpression

  /** 排序表达式 */
  sortExpression?: SortExpression

  /** 是否自动选择第一行 */
  autoSelectFirst?: boolean

  // ===== 关联对象 =====

  /** 树形数据管理器 */
  treeManager?: TreeManager

  /** CRUD 服务实例（按需初始化） */
  private crudService?: CrudService

  /** 订阅者集合（UI 层通过 subscribe 注册） */
  private subscribers = new Set<() => void>()

  /** 事件发射器 — stateChanged 事件供子视图级联和 DataSet 观察 */
  readonly events: IEventEmitter = createEventEmitter()

  /** 级联取消订阅列表（teardownCascade 清理用） */
  private cascadeUnsubscribers: (() => void)[] = []

  /** 日志记录器 */
  protected logger = Logger('DataView')

  // ===== 构造函数 =====

  /**
   * 创建数据视图实例
   * @param tableName 表名
   * @param viewId 数据视图ID
   */
  constructor(tableName: string, viewId: string = 'default') {
    this.tableName = tableName
    this.viewId = viewId
    this.id = `dv:${tableName}:${viewId}`

    // 注册 DATA_VIEW 能力（与组件系统同构：provide(ctx, key, impl)）
    const view = this
    setCapability(this, DATA_VIEW, {
      get dataView() { return view },
      tableName: this.tableName,
      viewId: this.viewId,
      get rows() { return view.rows },
      get currentRow() { return view.currentRow }
    } satisfies IDataViewCapability)
  }

  // ===== 级联订阅（SOLID：子视图订阅父视图，自行响应） =====

  /**
   * 设置级联监听 — 子视图消费 DATA_SET 能力发现父关系，订阅父视图
   *
   * 调用时机：DataTable 设置 parent 链后调用。
   * 原理：lookup(this, DATA_SET) 沿 parent 链找到 DataSet，
   *       查询 "以本视图为子" 的关系，订阅父视图 stateChanged 事件。
   *       父状态变化 → 本视图回调自行决定：清空 or 请求数据。
   */
  setupCascade(): void {
    this.teardownCascade()

    // 消费 DATA_SET 能力（沿 parent 链：DataView → DataTable → DataSet）
    const dsCap = lookup<{ dataSet: { relations?: DataRelation[]; getTable(n: string): { getOrCreateView(id: string): DataView } | undefined; getParentRelations(childTable: string, childViewId?: string): DataRelation[]; getView(tableName: string, viewId?: string): DataView | undefined } }>(this, DATA_SET)
    if (!dsCap) return

    const ds = dsCap.dataSet
    // 查找以本视图为子的关系（由 DataSet 提供）
    const parentRels = ds.getParentRelations(this.tableName, this.viewId)

    for (const rel of parentRels) {
      const parentView = ds.getView(rel.parentTable, rel.parentViewId ?? 'default')
      if (!parentView) continue

      // 订阅父视图 stateChanged 事件 → 自行响应
      const handler = () => this.respondToParentChange(rel, parentView)
      parentView.events.on('stateChanged', handler)
      this.cascadeUnsubscribers.push(() => parentView.events.off('stateChanged', handler))
    }
  }

  /**
   * 清理级联订阅
   */
  teardownCascade(): void {
    for (const unsub of this.cascadeUnsubscribers) unsub()
    this.cascadeUnsubscribers = []
  }

  /**
   * 子视图自行响应父视图变更（SOLID：自己决定、自己执行）
   *
   * - 父无数据 → 清空自己（notifySubscribers 触发孙视图级联）
   * - 父有数据 + autoLoad → 主动调用自己的 loadFromServer()
   */
  private respondToParentChange(rel: DataRelation, parentView: DataView): void {
    const parentRows = getParentRows(parentView, rel.dependencyType)

    if (!parentRows.length) {
      this.resetState()
      this.notifySubscribers()
      // 发射 stateChanged 让下游子视图也级联
      this.events.emit('stateChanged', {
        tableName: this.tableName, viewId: this.viewId, changeType: 'cleared'
      })
      return
    }

    if (rel.autoLoad) {
      // 视图主动调用自己的加载方法（不经过 DataSet 协调）
      this.loadFromServer().catch(err => {
        this.logger.error(`级联加载 ${this.tableName}:${this.viewId} 失败`, err)
      })
    }
  }

  // ===== 树管理器管理 =====

  /**
   * 设置树形数据管理器
   * @param tm 树管理器实例
   */
  setTreeManager(tm: TreeManager): void {
    this.treeManager = tm
    if (typeof tm.setDataView === 'function') tm.setDataView(this)
  }

  /**
   * 获取树形数据管理器
   * @returns 树管理器实例
   */
  getTreeManager(): TreeManager | undefined {
    return this.treeManager
  }

  // ===== 加载状态管理 =====

  /**
   * 设置加载状态
   */
  setLoading(): void {
    this.isLoading = true
    this.loadingError = null
  }

  /**
   * 设置就绪状态
   */
  setReady(): void {
    this.isLoading = false
    this.loadingError = null
  }

  /**
   * 设置错误状态
   * @param e 错误对象
   */
  setError(e: Error): void {
    this.isLoading = false
    this.loadingError = e
  }

  // ===== 选中状态管理 =====

  /**
   * 设置当前选中行
   *
   * 更新自身状态 → 发射 stateChanged 事件 → 通知 UI 订阅者
   * 子视图通过 stateChanged 订阅自行响应（SOLID）
   */
  setCurrentRow(row: IDataRow | null): void {
    if (this.currentRow === row) return

    this.currentRow = row
    this.currentRowIndex = row === null ? null : this.rows.indexOf(row)
    if (this.currentRowIndex === -1) this.currentRowIndex = null

    this.events.emit('stateChanged', {
      tableName: this.tableName, viewId: this.viewId,
      changeType: 'currentRow', row
    } satisfies ViewStateEvent)
    this.notifySubscribers()
  }

  /**
   * 设置选中的多行数据
   */
  setSelectedRows(rows: IDataRow[]): void {
    const cur = this.selectedRows
    if (cur.length === rows.length && cur.every((r, i) => r === rows[i])) return

    this.selectedRows = rows
    this.selectedRowIndices = rows.map(r => this.rows.indexOf(r)).filter(i => i !== -1)

    this.events.emit('stateChanged', {
      tableName: this.tableName, viewId: this.viewId,
      changeType: 'selectedRows', rows
    } satisfies ViewStateEvent)
    this.notifySubscribers()
  }

  // ===== 数据清理 =====

  /**
   * 更新视图数据（从服务器加载场景）
   * @param data 服务器返回的数据对象
   */
  updateFromServer(data: { rows?: IDataRow[]; total?: number; page?: number; pageSize?: number } | IDataRow[]): void {
    if (Array.isArray(data)) {
      this.rows = data
    } else {
      if (data.rows) this.rows = data.rows
      if (data.total !== undefined) this.total = data.total
      if (data.page !== undefined) this.page = data.page
      if (data.pageSize !== undefined) this.pageSize = data.pageSize
    }
  }

  /**
   * 查询数据方法 C（视图级编排器）
   *
   * 流程（C 自身不迭代，每段独立）：
   *   4.1  设 D=1（请求中）
   *   4.2  遍历 AR（父关系），父 D==0 → 调用父的 C；
   *        确认所有父 D==2 且数据存在
   *   4.3  全部依赖满足 → 根据关系表达式组织请求参数 → 发起请求
   *        成功 D=2，失败 D=3
   *   4.4  请求成功 → 数据赋值（UI 自动同步）→ 调用 BR（子关系）每项的 C
   */
  async requestWithRelations(): Promise<void> {
    // 幂等：仅在未请求状态下触发
    if (this.requestState !== 0) return

    // 4.1: 标识 D=1 请求中
    this.requestState = 1

    // 通过 DATA_SET 获取关系查询能力（AR + BR + 视图查找）
    const dsCap = lookup<{ dataSet: {
      getParentRelations: (t: string, v?: string) => DataRelation[]
      getChildRelations: (t: string, v: string) => DataRelation[]
      getView: (t: string, v?: string) => DataView | undefined
    } }>(this, DATA_SET)
    const ds = dsCap?.dataSet
    if (!ds) { this.requestState = 0; return }

    // 4.2: 获取 AR（父关系），逐项确保父依赖满足
    const parents = ds.getParentRelations(this.tableName, this.viewId)

    for (const rel of parents) {
      const pView = ds.getView(rel.parentTable, rel.parentViewId ?? 'default')
      if (!pView) continue

      // 父未请求 → 调用父的 C（requestWithRelations），不是 loadFromServer
      if (pView.requestState === 0) {
        try {
          await pView.requestWithRelations()
        } catch {
          this.requestState = 3
          return
        }
      }

      // 检查父依赖是否满足：D==2 且数据存在
      const parentRows = getParentRows(pView, rel.dependencyType)
      if (pView.requestState !== 2 || parentRows.length === 0) {
        this.requestState = 3
        return
      }
    }

    // 4.3: 全部依赖满足 → 根据关系中的表达式组织请求参数
    const params: QueryParams = {}
    for (const rel of parents) {
      const pView = ds.getView(rel.parentTable, rel.parentViewId ?? 'default')
      if (!pView) continue
      const parentRows = getParentRows(pView, rel.dependencyType)
      if (!parentRows.length) continue
      const expr = rel.filterExpression
      if (!expr) continue

      // 父端字段：优先 rel.parentField → 'id' → 第一个字段
      let parentKey: string | undefined
      const pf = rel.parentField as unknown
      if (typeof pf === 'string') {
        parentKey = pf
      } else {
        const firstRow = parentRows[0]
        if (firstRow) parentKey = (firstRow['id'] !== undefined ? 'id' : Object.keys(firstRow)[0])
        else parentKey = 'id'
      }

      const values = parentRows.map(r => (r[parentKey as string] ?? Object.values(r)[0]))

      // 子端参数名：优先 rel.childField → filterExpression.field → parentKey
      let childKey: string
      const cf = rel.childField as unknown
      if (typeof cf === 'string') childKey = cf
      else if ('field' in expr) childKey = expr.field
      else childKey = parentKey as string

      if ('op' in expr && 'field' in expr) {
        if (expr.op === 'in') params[childKey] = values
        else params[childKey] = values[0]
      } else {
        params[childKey] = values[0]
      }
    }

    // 发起请求（loadFromServer 设 D=2 或 D=3）
    try {
      await this.loadFromServer(params)
    } catch {
      // loadFromServer 内部已设 requestState=3
      return
    }

    // 4.4: 请求成功 → 数据已赋值给当前视图 → UI 自动同步
    //      调用 BR（子关系）中每项的 C — C 自身不迭代，只触发
    const children = ds.getChildRelations(this.tableName, this.viewId)
    for (const bi of children) {
      const childView = ds.getView(bi.childTable, bi.childViewId ?? 'default')
      if (childView?.requestState === 0) {
        // fire-and-forget：C 自身不迭代，子视图独立执行自己的 C
        childView.requestWithRelations().catch(err => {
          this.logger.error(`子视图 ${bi.childTable}:${bi.childViewId ?? 'default'} 请求失败`, err)
        })
      }
    }
  }
  /**
   * 添加单行数据
   * @param row 新行数据
   */
  appendRow(row: IDataRow): void {
    this.rows.push(row)
  }

  /**
   * 更新指定行数据（部分更新）
   * @param id 行 ID
   * @param data 更新数据
   * @returns 更新成功返回 true，未找到返回 false
   */
  updateRowById(id: string | number, data: Partial<IDataRow>): boolean {
    const index = this.rows.findIndex(row => row['id'] === id)
    if (index < 0) return false
    this.rows[index] = { ...this.rows[index], ...data }
    return true
  }

  /**
   * 删除指定行
   * @param id 行 ID
   * @returns 删除成功返回 true，未找到返回 false
   */
  deleteRowById(id: string | number): boolean {
    const index = this.rows.findIndex(row => row['id'] === id)
    if (index < 0) return false
    this.rows.splice(index, 1)
    return true
  }

  /**
   * 替换所有行（用于视图同步场景）
   * @param rows 新的行数据
   */
  replaceRows(rows: IDataRow[]): void {
    this.rows.splice(0, this.rows.length, ...rows)
  }

  // ===== CRUD 服务初始化 =====

  /**
   * 初始化 CRUD 服务（从 parent DataTable 获取配置）
   */
  private initializeCrudService(): void {
    if (!this.parent) return
    const tableCapability = lookup<IDataTableCapability>(this.parent, DATA_TABLE)
    if (!tableCapability?.dataTable) return
    const table = tableCapability.dataTable
    if (table.api) {
      this.crudService = createCrudService(table.api)
    }
  }

  /**
   * 获取 CRUD 配置（从 parent DataTable）
   */
  private getCrudConfig(): CrudOperationConfig | undefined {
    if (!this.parent) return undefined
    const tableCapability = lookup<IDataTableCapability>(this.parent, DATA_TABLE)
    return tableCapability?.dataTable?.crudConfig
  }

  // ===== 网络 CRUD 操作 =====

  /**
   * 从服务器加载数据（带防重入）
   */
  async loadFromServer(params?: QueryParams): Promise<CrudResult> {
    // 防重入：如果正在加载，直接返回成功（避免重复请求）
    if (this.isLoading) {
      return { success: true, message: 'Already loading' }
    }

    // 标记请求状态 = 请求中
    this.requestState = 1

    if (!this.crudService) this.initializeCrudService()
    if (!this.crudService) {
      this.requestState = 3
      throw new Error(`Table ${this.tableName} has no API configuration`)
    }

    this.setLoading()
    try {
      const result = await this.crudService.list(params, this.getCrudConfig())
      if (result.success && result.data) {
        this.updateFromServer(result.data as { rows?: IDataRow[]; total?: number; page?: number; pageSize?: number } | IDataRow[])
        this.notifySubscribers()
        // 标记完成
        this.requestState = 2
      } else {
        // 认为为失败分支（保持语义明确）
        this.requestState = 3
      }
      return result
    } catch (error) {
      this.setError(error as Error)
      this.requestState = 3
      throw error
    } finally {
      this.setReady()
    }
  }

  /**
   * 创建记录
   */
  async createRecord(data: Partial<IDataRow>): Promise<CrudResult<IDataRow>> {
    if (!this.crudService) this.initializeCrudService()
    if (!this.crudService) throw new Error(`Table ${this.tableName} has no API configuration`)
    
    const result = await this.crudService.create<IDataRow>(data, this.getCrudConfig())
    if (result.success && result.data) {
      this.appendRow(result.data)
      this.notifySubscribers()
    }
    return result
  }

  /**
   * 更新记录
   */
  async updateRecord(id: string | number, data: Partial<IDataRow>): Promise<CrudResult<IDataRow>> {
    if (!this.crudService) this.initializeCrudService()
    if (!this.crudService) throw new Error(`Table ${this.tableName} has no API configuration`)
    
    const result = await this.crudService.update<IDataRow>(id, data, this.getCrudConfig())
    if (result.success && result.data) {
      if (this.updateRowById(id, result.data)) {
        this.notifySubscribers()
      }
    }
    return result
  }

  /**
   * 删除记录
   */
  async deleteRecord(id: string | number): Promise<CrudResult<boolean>> {
    if (!this.crudService) this.initializeCrudService()
    if (!this.crudService) throw new Error(`Table ${this.tableName} has no API configuration`)
    
    const result = await this.crudService.delete(id, this.getCrudConfig())
    if (result.success) {
      if (this.deleteRowById(id)) {
        this.notifySubscribers()
      }
    }
    return result
  }

  /**
   * 批量创建
   */
  async batchCreateRecords(items: Partial<IDataRow>[]): Promise<CrudResult<BatchResult>> {
    if (!this.crudService) this.initializeCrudService()
    if (!this.crudService) throw new Error(`Table ${this.tableName} has no API configuration`)
    
    const result = await this.crudService.batchCreate<IDataRow>(items, this.getCrudConfig())
    if (result.success && result.data) {
      for (const itemResult of result.data.results) {
        if (itemResult.success && itemResult.data) this.appendRow(itemResult.data as IDataRow)
      }
      this.notifySubscribers()
    }
    return result
  }

  /**
   * 批量更新
   */
  async batchUpdateRecords(items: Array<{ id: string | number } & Partial<IDataRow>>): Promise<CrudResult<BatchResult>> {
    if (!this.crudService) this.initializeCrudService()
    if (!this.crudService) throw new Error(`Table ${this.tableName} has no API configuration`)
    
    const result = await this.crudService.batchUpdate<IDataRow>(items, this.getCrudConfig())
    if (result.success && result.data) {
      for (const itemResult of result.data.results) {
        if (itemResult.success && itemResult.data) {
          const record = itemResult.data as IDataRow
          const id = (record as { id?: unknown }).id
          if (id !== undefined) this.updateRowById(id as string | number, record)
        }
      }
      this.notifySubscribers()
    }
    return result
  }

  /**
   * 批量删除
   */
  async batchDeleteRecords(ids: Array<string | number>): Promise<CrudResult<BatchResult>> {
    if (!this.crudService) this.initializeCrudService()
    if (!this.crudService) throw new Error(`Table ${this.tableName} has no API configuration`)
    
    const result = await this.crudService.batchDelete(ids, this.getCrudConfig())
    if (result.success && result.data) {
      for (const id of ids) {
        this.deleteRowById(id)
      }
      this.notifySubscribers()
    }
    return result
  }

  /**
   * 导入数据
   */
  async importData(file: File): Promise<CrudResult<{ imported: number; failed: number }>> {
    if (!this.crudService) this.initializeCrudService()
    if (!this.crudService) throw new Error(`Table ${this.tableName} has no API configuration`)
    
    const result = await this.crudService.importData(file)
    if (result.success) {
      await this.loadFromServer()
    }
    return result
  }

  /**
   * 导出数据
   */
  async exportData(params?: QueryParams): Promise<CrudResult<Blob>> {
    if (!this.crudService) this.initializeCrudService()
    if (!this.crudService) throw new Error(`Table ${this.tableName} has no API configuration`)
    
    return await this.crudService.exportData(params)
  }

  /**
   * 清空所有状态
   */
  clearAll(): void {
    const had = this.rows.length > 0 || this.currentRow !== null || this.selectedRows.length > 0
    this.resetState()

    if (had) {
      this.events.emit('stateChanged', {
        tableName: this.tableName, viewId: this.viewId,
        changeType: 'cleared'
      } satisfies ViewStateEvent)
      this.notifySubscribers()
    }
  }

  /**
   * 静默重置状态（不通知上层，供关系级联使用）
   * 遵循 SOLID：上层通过此方法清理下层状态，避免循环通知
   */
  resetState(): void {
    this.rows.splice(0, this.rows.length)
    this.currentRow = null
    this.currentRowIndex = null
    this.selectedRows.splice(0, this.selectedRows.length)
    this.selectedRowIndices = []
  }

  /**
   * 清理无效的选中状态
   * @returns 是否有清理操作
   */
  cleanupInvalidSelections(): boolean {
    let cleaned = false
    if (this.currentRow && !this.rows.some(r => isSameRow(r, this.currentRow))) {
      this.currentRow = null
      this.currentRowIndex = null
      cleaned = true
    }
    if (this.selectedRows.length > 0) {
      const valid = this.selectedRows.filter(sr => this.rows.some(r => isSameRow(r, sr)))
      if (valid.length !== this.selectedRows.length) {
        this.selectedRows = valid
        this.selectedRowIndices = valid.map(r => this.rows.indexOf(r)).filter(i => i !== -1)
        cleaned = true
      }
    }
    return cleaned
  }

  // ===== 订阅管理（视图级） =====

  /**
   * 订阅此视图的数据变化
   * @param cb 回调函数
   * @returns 取消订阅函数
   */
  subscribe(cb: () => void): () => void {
    this.subscribers.add(cb)
    return () => {
      this.subscribers.delete(cb)
    }
  }

  /**
   * 通知此视图的所有订阅者
   */
  notifySubscribers(): void {
    for (const cb of [...this.subscribers]) {
      try { cb() } catch (e) { this.logger.error('订阅通知错误:', e) }
    }
  }

  /**
   * 检查此视图是否有订阅者
   */
  hasSubscribers(): boolean {
    return this.subscribers.size > 0
  }

  // ===== 序列化 =====

  /**
   * 序列化为元数据对象
   * @returns 视图元数据
   */
  toData(): IViewMetadata {
    const result: IViewMetadata = {
      tableName: this.tableName,
      viewId: this.viewId,
      page: this.page,
      pageSize: this.pageSize,
      rows: this.rows,
    }

    if (this.filterExpression !== undefined) result.filterExpression = this.filterExpression
    if (this.sortExpression !== undefined) result.sortExpression = this.sortExpression
    if (this.autoSelectFirst !== undefined) result.autoSelectFirst = this.autoSelectFirst

    return result
  }

  // ===== 工厂方法 =====

  /**
   * 从元数据创建数据视图实例
   * @param data 视图元数据
   * @param tableName 表名
   * @param viewId 数据视图ID
   * @returns 数据视图实例
   */
  static fromData(data: IViewMetadata, tableName: string, viewId: string): DataView {
    const v = new DataView(tableName, viewId)
    if (data.filterExpression !== undefined) v.filterExpression = data.filterExpression
    if (data.sortExpression !== undefined) v.sortExpression = data.sortExpression
    if (data.autoSelectFirst !== undefined) v.autoSelectFirst = data.autoSelectFirst
    v.page = data.page ?? 1
    v.pageSize = data.pageSize ?? 20
    return v
  }

}
