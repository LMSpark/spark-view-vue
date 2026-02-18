/**
 * DataView — 数据视图，SPARK 数据层的统一交互枢纽
 *
 * ## 能力系统角色
 *   提供：DATA_VIEW（供 UI 组件消费行数据、选中状态）
 *   消费：DATA_SET（沿 parent 链查询关系，驱动加载编排）
 *
 * ## parent 链
 *   DataView → DataTable → DataSet
 *   lookup(this, DATA_SET) 自动向上查找，无需手动传引用。
 *
 * ## 级联加载（SOLID：子订阅父，父不知子）
 *   子视图通过 setupCascade() 订阅父视图的 stateChanged 事件，
 *   父状态变化时子视图自行决定：清空 or 重新请求。
 *
 * ## 请求编排（requestState 状态机）
 *   0=未请求  1=请求中  2=已完成  3=失败
 *   requestData() 实现完整的 C 方法四步流程。
 */

import type {
  IDataRow, IViewMetadata, FilterExpression, SortExpression,
  ViewStateEvent, DataRelation, CrudOperationConfig, QueryParams,
  CrudResult, BatchResult, IDataSource, IModelPermission,
} from './types'
import type { TreeManager } from './tree-manager'
import {
  Logger, DATA_VIEW, DATA_SET, DATA_TABLE,
  provide as setCapability, lookup, createEventEmitter,
} from '@spark-view/spark-utils'
import type { CapabilityName, ICapabilityContext, IEventEmitter } from '@spark-view/spark-utils'
import { isSameRow, getParentRows } from './core/utils'
import { CrudService, createCrudService } from './crud-service'
import type { IDataTableCapability } from './data-table'

// ─────────────────────────────────────────────
// 能力接口（避免循环引用，与类同文件定义）
// ─────────────────────────────────────────────

/**
 * DataSet 能力中用于关系查询的最小接口
 * （requestData / triggerChildViews 共用）
 */
interface IDataSetRelationCap {
  getParentRelations: (t: string, v?: string) => DataRelation[]
  getChildRelations:  (t: string, v: string)  => DataRelation[]
  getView:            (t: string, v?: string)  => DataView | undefined
}

/** DataView 向 UI/组件暴露的能力 */
export interface IDataViewCapability {
  readonly dataView: DataView
  readonly tableName: string
  readonly viewId: string
  /** 响应式 getter — 当前行数据 */
  readonly rows: IDataRow[]
  /** 响应式 getter — 当前选中行 */
  readonly currentRow: IDataRow | null
}

// ─────────────────────────────────────────────
// DataView 类
// ─────────────────────────────────────────────

export class DataView implements ICapabilityContext, IDataSource {

  // ── ICapabilityContext ──────────────────────

  id: string
  readonly type = 'dataview'
  /** 父级：DataTable，由 DataTable.setDataSet() 建立 parent 链时设置 */
  parent?: ICapabilityContext
  capabilities = new Map<CapabilityName, unknown>()

  // ── 标识 ────────────────────────────────────

  tableName: string
  viewId: string

  // ── 行数据 ──────────────────────────────────

  rows: IDataRow[] = []
  /** 过滤 / 排序前的原始行（备用） */
  originalRows?: IDataRow[]

  // ── 选中状态 ────────────────────────────────

  currentRow: IDataRow | null = null
  currentRowIndex: number | null = null
  selectedRows: IDataRow[] = []
  selectedRowIndices: number[] = []

  // ── 分页 ────────────────────────────────────

  total: number = 0
  page: number = 1
  pageSize: number = 20

  // ── 加载状态 ────────────────────────────────

  /** 派生自 requestState：requestState===1 时为 true */
  get isLoading(): boolean { return this.requestState === 1 }
  loadingError: Error | null = null
  /**
   * 请求状态机
   *   0 未请求 | 1 请求中 | 2 已完成 | 3 失败
   */
  requestState: 0 | 1 | 2 | 3 = 0

  // ── 视图配置 ────────────────────────────────

  filterExpression?: FilterExpression
  sortExpression?: SortExpression
  autoSelectFirst?: boolean

  // ── 权限（IDataSource 兼容） ─────────────────

  _modelPerm?: IModelPermission

  // ── 关联对象 ────────────────────────────────

  treeManager?: TreeManager

  // ── 私有 ─────────────────────────────────────

  /** CRUD 服务（按需懒初始化） */
  private crudService?: CrudService
  /** UI 订阅者 */
  private subscribers = new Set<() => void>()
  /** 级联取消订阅句柄 */
  private cascadeUnsubscribers: (() => void)[] = []

  // ── 公共内部对象 ─────────────────────────────

  /** stateChanged 事件总线，供子视图订阅 */
  readonly events: IEventEmitter = createEventEmitter()

  protected logger = Logger('DataView')

  // ─────────────────────────────────────────────
  // 构造 & 能力注册
  // ─────────────────────────────────────────────

  constructor(tableName: string, viewId: string = 'default') {
    this.tableName = tableName
    this.viewId = viewId
    this.id = `dv:${tableName}:${viewId}`

    const view = this
    setCapability(this, DATA_VIEW, {
      get dataView() { return view },
      tableName: this.tableName,
      viewId: this.viewId,
      get rows() { return view.rows },
      get currentRow() { return view.currentRow },
    } satisfies IDataViewCapability)
  }

  // ─────────────────────────────────────────────
  // 请求流
  // ─────────────────────────────────────────────

  // ── 上行：父依赖解析 → 加载自身 ──────────────

  /**
   * 视图级加载编排器（幂等：requestState≠0 时直接返回）
   *
   * 1. 置 requestState=1，沿 parent 链取 DataSet 父关系列表
   * 2. 逐个父视图：若未请求则先递归调用其 requestData()；
   *    父 requestState≠2 或无数据 → 置 requestState=3 中止
   * 3. 所有父满足后，按各关系的 filterExpression 组装查询参数
   *    → 调用 loadFromServer()（成功置 requestState=2，失败置 3）
   * 4. 成功后调用 triggerChildViews() 触发所有子视图
   */
  async requestData(): Promise<void> {
    if (this.requestState !== 0) return

    this.requestState = 1

    const dsCap = lookup<{ dataSet: IDataSetRelationCap }>(this, DATA_SET)
    const ds = dsCap?.dataSet
    if (!ds) { this.requestState = 0; return }

    // 逐个父视图检查依赖是否满足
    const parents = ds.getParentRelations(this.tableName, this.viewId)
    for (const rel of parents) {
      const pView = ds.getView(rel.parentTable, rel.parentViewId ?? 'default')
      if (!pView) continue

      if (pView.requestState === 0) {
        try { await pView.requestData() }
        catch { this.requestState = 3; return }
      }

      const parentRows = getParentRows(pView, rel.dependencyType)
      if (pView.requestState !== 2 || parentRows.length === 0) {
        this.requestState = 3
        return
      }
    }

    // 按各关系的 filterExpression 组装查询参数
    const params: QueryParams = {}
    for (const rel of parents) {
      const pView = ds.getView(rel.parentTable, rel.parentViewId ?? 'default')
      if (!pView) continue
      const parentRows = getParentRows(pView, rel.dependencyType)
      if (!parentRows.length) continue
      const expr = rel.filterExpression
      if (!expr) continue

      let parentKey: string | undefined
      const pf = rel.parentField as unknown
      if (typeof pf === 'string') {
        parentKey = pf
      } else {
        const first = parentRows[0]
        parentKey = first ? (first['id'] !== undefined ? 'id' : Object.keys(first)[0]) : 'id'
      }

      const values = parentRows.map(r => r[parentKey as string] ?? Object.values(r)[0])

      let childKey: string
      const cf = rel.childField as unknown
      if (typeof cf === 'string') childKey = cf
      else if ('field' in expr) childKey = expr.field
      else childKey = parentKey as string

      if ('op' in expr && 'field' in expr) {
        params[childKey] = expr.op === 'in' ? values : values[0]
      } else {
        params[childKey] = values[0]
      }
    }

    try { await this.loadFromServer(params) }
    catch { return }

    this.triggerChildViews(ds)
  }

  /**
   * 从服务器拉取列表（带防重入）
   * - 成功：requestState=2，数据写入 rows，通知订阅者
   * - 失败：requestState=3，抛出异常
   */
  async loadFromServer(params?: QueryParams): Promise<CrudResult> {
    if (this.isLoading) return { success: true, message: 'Already loading' }

    this.requestState = 1
    this.loadingError = null
    if (!this.crudService) this.initializeCrudService()
    if (!this.crudService) {
      this.requestState = 3
      throw new Error(`Table ${this.tableName} has no API configuration`)
    }

    try {
      const result = await this.crudService.list(params, this.getCrudConfig())
      if (result.success && result.data) {
        this.updateFromServer(result.data as { rows?: IDataRow[]; total?: number; page?: number; pageSize?: number } | IDataRow[])
        this.notifySubscribers()
        this.requestState = 2
      } else {
        this.requestState = 3
      }
      return result
    } catch (error) {
      this.loadingError = error as Error
      this.requestState = 3
      throw error
    }
  }

  // ── 下行：级联触发子视图 ──────────────────────

  /**
   * 对所有子关系视图触发 requestData()（fire-and-forget）
   * 仅当子视图 requestState===0 时触发，避免重复请求。
   */
  private triggerChildViews(ds: IDataSetRelationCap): void {
    const children = ds.getChildRelations(this.tableName, this.viewId)
    for (const bi of children) {
      const childView = ds.getView(bi.childTable, bi.childViewId ?? 'default')
      if (childView?.requestState === 0) {
        childView.requestData().catch(err => {
          this.logger.error(`子视图 ${bi.childTable}:${bi.childViewId ?? 'default'} 请求失败`, err)
        })
      }
    }
  }

  // ─────────────────────────────────────────────
  // CRUD（单条 & 批量 & 导入导出）
  // ─────────────────────────────────────────────

  /** 新增记录，成功后追加至 rows */
  async createRecord(data: Partial<IDataRow>): Promise<CrudResult<IDataRow>> {
    const svc = this.ensureCrudService()
    const result = await svc.create<IDataRow>(data, this.getCrudConfig())
    if (result.success && result.data) {
      this.appendRow(result.data)
      this.notifySubscribers()
    }
    return result
  }

  /** 更新记录，成功后刷新对应行 */
  async updateRecord(id: string | number, data: Partial<IDataRow>): Promise<CrudResult<IDataRow>> {
    const svc = this.ensureCrudService()
    const result = await svc.update<IDataRow>(id, data, this.getCrudConfig())
    if (result.success && result.data && this.updateRowById(id, result.data)) {
      this.notifySubscribers()
    }
    return result
  }

  /** 删除记录，成功后从 rows 移除 */
  async deleteRecord(id: string | number): Promise<CrudResult<boolean>> {
    const svc = this.ensureCrudService()
    const result = await svc.delete(id, this.getCrudConfig())
    if (result.success && this.deleteRowById(id)) {
      this.notifySubscribers()
    }
    return result
  }

  /** 批量新增 */
  async batchCreateRecords(items: Partial<IDataRow>[]): Promise<CrudResult<BatchResult>> {
    const svc = this.ensureCrudService()
    const result = await svc.batchCreate<IDataRow>(items, this.getCrudConfig())
    if (result.success && result.data) {
      for (const r of result.data.results) {
        if (r.success && r.data) this.appendRow(r.data as IDataRow)
      }
      this.notifySubscribers()
    }
    return result
  }

  /** 批量更新 */
  async batchUpdateRecords(items: Array<{ id: string | number } & Partial<IDataRow>>): Promise<CrudResult<BatchResult>> {
    const svc = this.ensureCrudService()
    const result = await svc.batchUpdate<IDataRow>(items, this.getCrudConfig())
    if (result.success && result.data) {
      for (const r of result.data.results) {
        if (r.success && r.data) {
          const record = r.data as IDataRow
          const id = (record as { id?: unknown }).id
          if (id !== undefined) this.updateRowById(id as string | number, record)
        }
      }
      this.notifySubscribers()
    }
    return result
  }

  /** 批量删除 */
  async batchDeleteRecords(ids: Array<string | number>): Promise<CrudResult<BatchResult>> {
    const svc = this.ensureCrudService()
    const result = await svc.batchDelete(ids, this.getCrudConfig())
    if (result.success && result.data) {
      for (const id of ids) this.deleteRowById(id)
      this.notifySubscribers()
    }
    return result
  }

  /** 导入文件，成功后刷新列表 */
  async importData(file: File): Promise<CrudResult<{ imported: number; failed: number }>> {
    const svc = this.ensureCrudService()
    const result = await svc.importData(file)
    if (result.success) await this.loadFromServer()
    return result
  }

  /** 导出数据 */
  async exportData(params?: QueryParams): Promise<CrudResult<Blob>> {
    return this.ensureCrudService().exportData(params)
  }

  // ─────────────────────────────────────────────
  // 行数据操作（内存）
  // ─────────────────────────────────────────────

  /** 将服务端响应同步到本地字段（rows / total / page / pageSize） */
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

  /** 追加一行 */
  appendRow(row: IDataRow): void {
    this.rows.push(row)
  }

  /** 按 id 部分更新一行，返回是否成功 */
  updateRowById(id: string | number, data: Partial<IDataRow>): boolean {
    const idx = this.rows.findIndex(r => r['id'] === id)
    if (idx < 0) return false
    this.rows[idx] = { ...this.rows[idx], ...data }
    return true
  }

  /** 按 id 删除一行，返回是否成功 */
  deleteRowById(id: string | number): boolean {
    const idx = this.rows.findIndex(r => r['id'] === id)
    if (idx < 0) return false
    this.rows.splice(idx, 1)
    return true
  }

  /** 整批替换所有行（响应式安全） */
  replaceRows(rows: IDataRow[]): void {
    this.rows.splice(0, this.rows.length, ...rows)
  }

  // ─────────────────────────────────────────────
  // 选中状态
  // ─────────────────────────────────────────────

  /**
   * 设置当前行
   * 状态变更 → 发射 stateChanged → 通知 UI 订阅者
   * 子视图通过 stateChanged 自行级联响应（SOLID）
   */
  setCurrentRow(row: IDataRow | null): void {
    if (this.currentRow === row) return
    this.currentRow = row
    this.currentRowIndex = row === null ? null : this.rows.indexOf(row)
    if (this.currentRowIndex === -1) this.currentRowIndex = null

    this.events.emit('stateChanged', {
      tableName: this.tableName, viewId: this.viewId,
      changeType: 'currentRow', row,
    } satisfies ViewStateEvent)
    this.notifySubscribers()
  }

  /** 设置多选行（幂等：内容不变时跳过） */
  setSelectedRows(rows: IDataRow[]): void {
    const cur = this.selectedRows
    if (cur.length === rows.length && cur.every((r, i) => r === rows[i])) return
    this.selectedRows = rows
    this.selectedRowIndices = rows.map(r => this.rows.indexOf(r)).filter(i => i !== -1)

    this.events.emit('stateChanged', {
      tableName: this.tableName, viewId: this.viewId,
      changeType: 'selectedRows', rows,
    } satisfies ViewStateEvent)
    this.notifySubscribers()
  }

  // ─────────────────────────────────────────────
  // 状态重置
  // ─────────────────────────────────────────────

  /** 清空所有状态并发射 cleared 事件（通知 UI 和子视图） */
  clearAll(): void {
    const had = this.rows.length > 0 || this.currentRow !== null || this.selectedRows.length > 0
    this.resetState()
    if (had) {
      this.events.emit('stateChanged', {
        tableName: this.tableName, viewId: this.viewId, changeType: 'cleared',
      } satisfies ViewStateEvent)
      this.notifySubscribers()
    }
  }

  /** 静默重置（不发事件），供关系级联调用 */
  resetState(): void {
    this.rows.splice(0, this.rows.length)
    this.currentRow = null
    this.currentRowIndex = null
    this.selectedRows.splice(0, this.selectedRows.length)
    this.selectedRowIndices = []
  }

  /** 清理已不在 rows 中的选中状态，返回是否发生了清理 */
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

  // ─────────────────────────────────────────────
  // 树管理器
  // ─────────────────────────────────────────────

  setTreeManager(tm: TreeManager): void {
    this.treeManager = tm
    if (typeof tm.setDataView === 'function') tm.setDataView(this)
  }

  getTreeManager(): TreeManager | undefined {
    return this.treeManager
  }

  // ─────────────────────────────────────────────
  // UI 订阅（视图级）
  // ─────────────────────────────────────────────

  /** 订阅数据变化，返回取消订阅函数 */
  subscribe(cb: () => void): () => void {
    this.subscribers.add(cb)
    return () => this.subscribers.delete(cb)
  }

  /** 通知所有 UI 订阅者 */
  notifySubscribers(): void {
    for (const cb of [...this.subscribers]) {
      try { cb() } catch (e) { this.logger.error('订阅通知错误:', e) }
    }
  }

  hasSubscribers(): boolean {
    return this.subscribers.size > 0
  }

  // ─────────────────────────────────────────────
  // 级联订阅（SOLID：子订阅父，父不知子）
  // ─────────────────────────────────────────────

  /**
   * 建立级联监听
   *
   * 沿 parent 链找到 DataSet → 查询以本视图为 child 的关系 →
   * 订阅每个父视图的 stateChanged 事件 → 父变化时自行响应。
   *
   * 调用时机：DataTable 建立 parent 链后调用。
   */
  setupCascade(): void {
    this.teardownCascade()

    const dsCap = lookup<{
      dataSet: {
        relations?: DataRelation[]
        getTable(n: string): { getOrCreateView(id: string): DataView } | undefined
        getParentRelations(childTable: string, childViewId?: string): DataRelation[]
        getView(tableName: string, viewId?: string): DataView | undefined
      }
    }>(this, DATA_SET)
    if (!dsCap) return

    const ds = dsCap.dataSet
    const parentRels = ds.getParentRelations(this.tableName, this.viewId)

    for (const rel of parentRels) {
      const parentView = ds.getView(rel.parentTable, rel.parentViewId ?? 'default')
      if (!parentView) continue

      const handler = () => this.respondToParentChange(rel, parentView)
      parentView.events.on('stateChanged', handler)
      this.cascadeUnsubscribers.push(() => parentView.events.off('stateChanged', handler))
    }
  }

  /** 清理全部级联订阅 */
  teardownCascade(): void {
    for (const unsub of this.cascadeUnsubscribers) unsub()
    this.cascadeUnsubscribers = []
  }

  /**
   * 响应父视图状态变化
   * - 父无数据 → 静默清空自己并下传 cleared 事件
   * - 父有数据且 autoLoad → 主动调用 loadFromServer()
   */
  private respondToParentChange(rel: DataRelation, parentView: DataView): void {
    const parentRows = getParentRows(parentView, rel.dependencyType)

    if (!parentRows.length) {
      this.resetState()
      this.notifySubscribers()
      this.events.emit('stateChanged', {
        tableName: this.tableName, viewId: this.viewId, changeType: 'cleared',
      })
      return
    }

    if (rel.autoLoad) {
      this.loadFromServer().catch(err => {
        this.logger.error(`级联加载 ${this.tableName}:${this.viewId} 失败`, err)
      })
    }
  }

  // ─────────────────────────────────────────────
  // CRUD 服务私有辅助
  // ─────────────────────────────────────────────

  /** 懒初始化 CrudService（从 parent DataTable 的 api 配置创建） */
  private initializeCrudService(): void {
    if (!this.parent) return
    const cap = lookup<IDataTableCapability>(this.parent, DATA_TABLE)
    if (cap?.dataTable?.api) {
      this.crudService = createCrudService(cap.dataTable.api)
    }
  }

  /** 获取 CRUD 操作配置（超时、重试等） */
  private getCrudConfig(): CrudOperationConfig | undefined {
    if (!this.parent) return undefined
    return lookup<IDataTableCapability>(this.parent, DATA_TABLE)?.dataTable?.crudConfig
  }

  /** 确保 CrudService 已初始化，否则抛出；返回实例供调用方直接使用 */
  private ensureCrudService(): CrudService {
    if (!this.crudService) this.initializeCrudService()
    if (!this.crudService) throw new Error(`Table ${this.tableName} has no API configuration`)
    return this.crudService
  }

  // ─────────────────────────────────────────────
  // 序列化 / 反序列化
  // ─────────────────────────────────────────────

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
