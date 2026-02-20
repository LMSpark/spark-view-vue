/**
 * DataView — 数据视图，SPARK 数据层的统一交互枢纽
 *
 * ## 引用链
 *   DataView → DataTable → DataSet
 *   直接访问：dataTable 获取 api/crudConfig，dataTable.dataSet 获取关系配置
 *
 * ## 级联加载（SOLID：子订阅父，父不知子）
 *   子视图通过 setupCascade() 订阅父视图的 stateChanged 事件，
 *   父状态变化时子视图自行决定：清空 or 重新请求。
 *
 * ## 请求编排
 *   requestData() 是统一入口：解析父依赖 → 加载自身 → 级联子视图
 *   requestState（RequestState 枚举）是唯一状态源，避免 isLoading/isRequesting 等布尔别名的歧义。
 *   幂等：requestState≠Idle 时立即返回，UI 层直接调用无需额外判断。
 */

import type {
  IDataRow, IViewMetadata, FilterExpression, SortExpression,
  ViewStateEvent, DataRelation, CrudOperationConfig, QueryParams,
  CrudResult, BatchResult,
} from './types'
import type { TreeManager } from './tree-manager'
import type { DataTable } from './data-table'
import { Logger, createEventEmitter } from '@spark-view/spark-utils'
import type { IEventEmitter } from '@spark-view/spark-utils'
import { isSameRow, getParentRows } from './core/utils'
import { CrudService, createCrudService } from './crud-service'
import type { ValidationResult } from './validation'

// ─────────────────────────────────────────────
// 事件类型映射
// ─────────────────────────────────────────────

/**
 * DataView 事件映射（用于 events 事件总线类型约束）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface DataViewEventMap extends Record<string, any[]> {
  stateChanged: [ViewStateEvent]
}

// ─────────────────────────────────────────────
// 能力接口（避免循环引用，与类同文件定义）
// ─────────────────────────────────────────────

/**
 * DataView 请求状态机
 *
 * ```
 * Idle ──requestData()──▶ Preparing ──loadFromServer()──▶ Loading
 *                                                                │
 *                                                ┌──────────────┴──────────────┐
 *                                              Loaded                        Failed
 * ```
 */
export enum RequestState {
  /** 未请求（初始态 / 被外部重置后） */
  Idle         = 0,
  /** 准备中：逐个检查父依赖、组装查询参数（条件具备前） */
  Preparing     = 1,
  /** loadFromServer 网络请求中（从服务器请求中） */
  Loading      = 2,
  /** 已完成 */
  Loaded       = 3,
  /** 失败（父依赖不满足 / 网络错误） */
  Failed       = 4,
}

// ─────────────────────────────────────────────
// DataView 类
// ─────────────────────────────────────────────

export class DataView {

  // ── DataTable 引用 ──────────────────

  /** 所属 DataTable（由 DataTable.setDataSet() 时设置） */
  dataTable!: DataTable

  // ── 标识 ────────────────────────────────────

  tableName: string
  viewId: string

  // ── 行数据 ──────────────────────────────────

  rows: IDataRow[] = []

  // ── 主键 ────────────────────────────────────

  /** 主键字段名，用于 SELECTION 能力的 ID 定位（默认 'id'） */
  primaryKey: string = 'id'

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

  loadingError: Error | null = null
  /** 请求状态机，见 {@link RequestState}。唯一状态源，勿另设布尔标志。 */
  requestState: RequestState = RequestState.Idle

  // ── 视图配置 ────────────────────────────────

  filterExpression?: FilterExpression
  sortExpression?: SortExpression
  autoSelectFirst?: boolean

  // ── 关联对象 ────────────────────────────────

  treeManager?: TreeManager

  // ── 私有 ─────────────────────────────────────

  /** CRUD 服务（按需懒初始化） */
  private crudService?: CrudService
  /** 级联取消订阅句柄 */
  private cascadeUnsubscribers: (() => void)[] = []  /** 待处理的级联请求（用于取消旧请求） */
  private pendingCascadeRequest?: {
    requestId: number
    cancel: () => void
  } | undefined
  /** 级联请求 ID 计数器 */
  private nextCascadeRequestId = 0
  /** 当前 loadFromServer 请求 ID（用于防止竞态） */
  private currentLoadRequestId = 0
  /** 销毁状态标记 */
  private _isDestroyed = false
  /** 行索引缓存（用于加速 setSelectedRows，O(n) 而非 O(n²)） */
  private rowIndexMap?: Map<IDataRow, number>
  /** stateChanged 事件防抖定时器 */
  private stateChangedDebouncer?: ReturnType<typeof setTimeout>
  
  // ── 公共内部对象 ─────────────────────────

  /**
   * stateChanged 事件总线——唯一通知通道
   *
   * UI 组件、子视图级联、外部监听者均通过此总线接收变更事件。
   * UI 组件、子视图级联、外部监听者均通过 `events.on('stateChanged', handler)` 订阅。
   */
  readonly events: IEventEmitter<DataViewEventMap> = createEventEmitter()

  protected logger = Logger('DataView')

  // ─────────────────────────────────────────────
  // 构造
  // ─────────────────────────────────────────────

  constructor(tableName: string, viewId: string = 'default') {
    this.tableName = tableName
    this.viewId = viewId
  }

  /** DataSet（向上访问） */
  private get dataSet() {
    return this.dataTable?.dataSet
  }

  // ─────────────────────────────────────────────
  // 请求流
  // ─────────────────────────────────────────────

  // ── 上行：父依赖解析 → 加载自身 ──────────────

  /**
   * 视图级加载编排器（幂等：requestState≠Idle 时直接返回）
   *
   * 1. 置 requestState=Preparing，沿 parent 链取 DataSet 父关系列表
   * 2. 逐个父视图：若未请求则 fire-and-forget 触发其 requestData()（不等待）；
   *    父 requestState∉{Loaded,Loading} 或无数据 → 置 requestState=Failed 中止
   * 3. 所有父满足后，按各关系的 filterExpression 组装查询参数
   *    → 调用 loadFromServer()（进入 Loading；成功置 Loaded，失败置 Failed）
   * 4. 子视图级联由 stateChanged('rows') 事件驱动（子订阅父，父不知子），无需主动推
   */
  async requestData(): Promise<void> {
    if (this.requestState !== RequestState.Idle) return

    this.requestState = RequestState.Preparing

    // 逐个父视图检查依赖是否满足
    const parents = this.dataSet?.getParentRelations(this.tableName, this.viewId) ?? []
    for (const rel of parents) {
      const pView = this.dataSet?.getView(rel.parentTable, rel.parentViewId ?? 'default')
      if (!pView) throw new Error(`父视图 ${rel.parentTable}:${rel.parentViewId ?? 'default'} 不存在，请检查 DataSet 关系配置`)

      if (pView.requestState === RequestState.Idle) {
        void pView.requestData()
      }

      const parentRows = getParentRows(pView, rel.dependencyType)
      if ((pView.requestState !== RequestState.Loaded && pView.requestState !== RequestState.Loading) || parentRows.length === 0) {
        this.requestState = RequestState.Failed
        this.emitStateChanged('requestState')
        return
      }
    }

    // 按各关系的 filterExpression 组装查询参数
    const params: QueryParams = {}
    for (const rel of parents) {
      const pView = this.dataSet?.getView(rel.parentTable, rel.parentViewId ?? 'default')
      if (!pView) throw new Error(`父视图 ${rel.parentTable}:${rel.parentViewId ?? 'default'} 不存在，请检查 DataSet 关系配置`)
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

    try {
      const result = await this.loadFromServer(params)
      if (!result.success) return
    } catch {
      return
    }

    // 子视图级联由 stateChanged('rows') 事件驱动（respondToParentChange），无需主动推
  }

  /**
   * 从服务器拉取列表（带防重入 + 请求ID防竞态）
   * - 成功：写入 rows，重置选中状态，requestState=Loaded，发射 stateChanged + 通知 UI
   * - 失败：requestState=Failed，通知 UI，抛出异常
   * - 竞态：后发请求到达时忽略先发但晚到的响应
   */
  async loadFromServer(params?: QueryParams): Promise<CrudResult> {
    this.checkDestroyed()  // 检查销毁状态
    if (this.requestState === RequestState.Loading) return { success: false, message: 'Already loading' }

    this.requestState = RequestState.Loading
    this.loadingError = null
    
    // 生成请求 ID（递增计数器）
    const requestId = ++this.currentLoadRequestId
    
    if (!this.crudService) this.initializeCrudService()
    if (!this.crudService) {
      this.requestState = RequestState.Failed
      this.emitStateChanged('requestState')
      throw new Error(`Table ${this.tableName} has no API configuration`)
    }

    try {
      const result = await this.crudService.list(params, this.getCrudConfig())
      
      // 检查是否被更新的请求替代
      if (requestId !== this.currentLoadRequestId) {
        this.logger.debug(`loadFromServer 请求 ${requestId} 被更新的请求 ${this.currentLoadRequestId} 替代，忽略响应`)
        return { success: false, message: 'Request superseded' }
      }
      
      if (result.success && result.data) {
        // 写入行数据 + 重置选中状态（新数据 → 旧选中无效）
        this.updateFromServer(result.data as { rows?: IDataRow[]; total?: number; page?: number; pageSize?: number } | IDataRow[])
        this.currentRow = null
        this.currentRowIndex = null
        this.selectedRows.splice(0, this.selectedRows.length)
        this.selectedRowIndices = []
        this.requestState = RequestState.Loaded
        this.emitStateChanged('rows')
      } else {
        this.requestState = RequestState.Failed
        this.emitStateChanged('requestState')
      }
      return result
    } catch (error) {
      // 异常时也要检查请求 ID（避免旧请求的异常覆盖新请求的状态）
      if (requestId !== this.currentLoadRequestId) {
        this.logger.debug(`loadFromServer 请求 ${requestId} 异常被忽略（已被新请求替代）`)
        return { success: false, message: 'Request superseded' }
      }
      
      this.loadingError = error as Error
      this.requestState = RequestState.Failed
      this.emitStateChanged('requestState')
      throw error
    }
  }

  // ─────────────────────────────────────────────
  // CRUD（单条 & 批量 & 导入导出）
  // ─────────────────────────────────────────────

  /** 新增记录，成功后追加至 rows */
  async createRecord(data: Partial<IDataRow>): Promise<CrudResult<IDataRow>> {
    // 数据校验
    const validationResult = this.validateRow(data as IDataRow)
    if (validationResult && !validationResult.valid) {
      return {
        success: false,
        message: `数据校验失败: ${validationResult.errors[0]?.message ?? '未知错误'}`,
        error: new Error(validationResult.errors[0]?.message ?? '数据校验失败')
      }
    }

    const svc = this.ensureCrudService()
    const result = await svc.create<IDataRow>(data, this.getCrudConfig())
    if (result.success && result.data) {
      this.appendRow(result.data)
      this.emitStateChanged('rows')
    }
    return result
  }

  /** 更新记录，成功后刷新对应行 */
  async updateRecord(id: string | number, data: Partial<IDataRow>): Promise<CrudResult<IDataRow>> {
    // 数据校验
    const validationResult = this.validateRow(data as IDataRow)
    if (validationResult && !validationResult.valid) {
      return {
        success: false,
        message: `数据校验失败: ${validationResult.errors[0]?.message ?? '未知错误'}`,
        error: new Error(validationResult.errors[0]?.message ?? '数据校验失败')
      }
    }

    const svc = this.ensureCrudService()
    const result = await svc.update<IDataRow>(id, data, this.getCrudConfig())
    if (result.success && result.data && this.updateRowById(id, result.data)) {
      this.emitStateChanged('rows')
    }
    return result
  }

  /** 删除记录，成功后从 rows 移除 */
  async deleteRecord(id: string | number): Promise<CrudResult<boolean>> {
    const svc = this.ensureCrudService()
    const result = await svc.delete(id, this.getCrudConfig())
    if (result.success && this.deleteRowById(id)) {
      this.emitStateChanged('rows')
    }
    return result
  }

  /** 批量新增 */
  async batchCreateRecords(items: Partial<IDataRow>[]): Promise<CrudResult<BatchResult>> {
    // 批量数据校验
    const validationErrors: string[] = []
    for (let i = 0; i < items.length; i++) {
      const validationResult = this.validateRow(items[i] as IDataRow)
      if (validationResult && !validationResult.valid) {
        validationErrors.push(`第${i + 1}条: ${validationResult.errors[0]?.message ?? '校验失败'}`)
      }
    }
    if (validationErrors.length > 0) {
      return {
        success: false,
        message: `批量数据校验失败: ${validationErrors.join('; ')}`,
        error: new Error(validationErrors[0])
      }
    }

    const svc = this.ensureCrudService()
    const result = await svc.batchCreate<IDataRow>(items, this.getCrudConfig())
    if (result.success && result.data) {
      for (const r of result.data.results) {
        if (r.success && r.data) this.appendRow(r.data as IDataRow)
      }
      this.emitStateChanged('rows')
    }
    return result
  }

  /** 批量更新 */
  async batchUpdateRecords(items: Array<{ id: string | number } & Partial<IDataRow>>): Promise<CrudResult<BatchResult>> {
    // 批量数据校验
    const validationErrors: string[] = []
    for (let i = 0; i < items.length; i++) {
      const validationResult = this.validateRow(items[i] as IDataRow)
      if (validationResult && !validationResult.valid) {
        validationErrors.push(`第${i + 1}条: ${validationResult.errors[0]?.message ?? '校验失败'}`)
      }
    }
    if (validationErrors.length > 0) {
      return {
        success: false,
        message: `批量数据校验失败: ${validationErrors.join('; ')}`,
        error: new Error(validationErrors[0])
      }
    }

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
      this.emitStateChanged('rows')
    }
    return result
  }

  /** 批量删除 */
  async batchDeleteRecords(ids: Array<string | number>): Promise<CrudResult<BatchResult>> {
    const svc = this.ensureCrudService()
    const result = await svc.batchDelete(ids, this.getCrudConfig())
    
    if (result.success && result.data) {
      // 只删除成功的项
      const successIds = new Set<string | number>()
      result.data.results.forEach((r, i) => {
        const id = ids[i]
        if (r.success && id !== undefined) successIds.add(id)
      })
      
      let deletedCount = 0
      for (const id of successIds) {
        if (this.deleteRowById(id)) deletedCount++
      }
      
      // 记录部分失败
      if (result.data.failureCount > 0) {
        this.logger.warn(`批量删除部分失败: ${result.data.failureCount}/${ids.length}`, {
          successCount: result.data.successCount,
          failureCount: result.data.failureCount
        })
      }
      
      if (deletedCount > 0) {
        this.emitStateChanged('rows')
      }
    }
    
    return result
  }

  /** 导入文件，成功后重置状态并重新走完整编排（含父依赖检查和子视图级联） */
  async importData(file: File): Promise<CrudResult<{ imported: number; failed: number }>> {
    const svc = this.ensureCrudService()
    const result = await svc.importData(file)
    if (result.success) {
      this.resetState()        // requestState 回到 Idle
      await this.requestData() // 重新走完整编排
    }
    return result
  }

  /** 导出数据 */
  async exportData(params?: QueryParams): Promise<CrudResult<Blob>> {
    return this.ensureCrudService().exportData(params)
  }

  // ─────────────────────────────────────────────
  // 行数据操作（内存）
  // ─────────────────────────────────────────────

  /** 将服务端响应同步到本地字段（rows / total / page / pageSize）——全程使用 splice 保持数组引用稳定 */
  updateFromServer(data: { rows?: IDataRow[]; total?: number; page?: number; pageSize?: number } | IDataRow[]): void {
    if (Array.isArray(data)) {
      this.rows.splice(0, this.rows.length, ...data)
    } else {
      if (data.rows) this.rows.splice(0, this.rows.length, ...data.rows)
      if (data.total !== undefined) this.total = data.total
      if (data.page !== undefined) this.page = data.page
      if (data.pageSize !== undefined) this.pageSize = data.pageSize
    }
    
    // 清除索引缓存（行数据变更后缓存失效）
    // @ts-expect-error - 清理可选属性
    this.rowIndexMap = undefined
  }

  /** 追加一行 */
  appendRow(row: IDataRow): void {
    this.rows.push(row)
  }

  /** 按主键部分更新一行，返回是否成功 */
  updateRowById(id: string | number, data: Partial<IDataRow>): boolean {
    const idx = this.rows.findIndex(r => r[this.primaryKey] === id)
    if (idx < 0) return false
    
    const oldRow = this.rows[idx]
    if (!oldRow) return false
    
    const newRow = { ...oldRow, ...data }
    this.rows[idx] = newRow
    
    // 同步更新选中状态的引用
    if (this.currentRow && isSameRow(this.currentRow, oldRow, this.primaryKey)) {
      this.currentRow = newRow
    }
    
    if (this.selectedRows.length > 0) {
      const selectedIdx = this.selectedRows.findIndex(r => isSameRow(r, oldRow, this.primaryKey))
      if (selectedIdx !== -1) {
        this.selectedRows[selectedIdx] = newRow
      }
    }
    
    return true
  }

  /** 按主键删除一行，返回是否成功 */
  deleteRowById(id: string | number): boolean {
    const idx = this.rows.findIndex(r => r[this.primaryKey] === id)
    if (idx < 0) return false
    
    const deletedRow = this.rows[idx]
    if (!deletedRow) return false
    
    this.rows.splice(idx, 1)
    
    // 清理选中状态
    if (this.currentRow && isSameRow(this.currentRow, deletedRow, this.primaryKey)) {
      this.currentRow = null
      this.currentRowIndex = null
    }
    
    if (this.selectedRows.length > 0) {
      const newSelected = this.selectedRows.filter(r => !isSameRow(r, deletedRow, this.primaryKey))
      if (newSelected.length !== this.selectedRows.length) {
        this.selectedRows.splice(0, this.selectedRows.length, ...newSelected)
        this.selectedRowIndices = newSelected.map(r => this.rows.indexOf(r)).filter(i => i !== -1)
      }
    }
    
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
   * 状态变更 → 发射 stateChanged → UI + 子视图级联均通过 events 接收
   */
  setCurrentRow(row: IDataRow | null): void {
    if (this.currentRow === row) return
    this.currentRow = row
    this.currentRowIndex = row === null ? null : this.rows.indexOf(row)
    if (this.currentRowIndex === -1) this.currentRowIndex = null
    this.emitStateChanged('currentRow', { row })
  }

  /** 设置多选行（幂等：内容不变时跳过） */
  setSelectedRows(rows: IDataRow[]): void {
    const cur = this.selectedRows
    if (cur.length === rows.length && cur.every((r, i) => r === rows[i])) return
    
    this.selectedRows.splice(0, this.selectedRows.length, ...rows)
    
    // 使用 Map 加速索引查找（O(n) 而非 O(n²)）
    this.rowIndexMap ??= new Map(this.rows.map((r, i) => [r, i]))
    
    this.selectedRowIndices = rows
      .map(r => this.rowIndexMap?.get(r) ?? -1)
      .filter(i => i !== -1)
    
    this.emitStateChanged('selectedRows', { rows })
  }

  // ─────────────────────────────────────────────
  // 状态重置
  // ─────────────────────────────────────────────

  /** 清空所有状态并发射 cleared 事件（通知 UI 和子视图） */
  clearAll(): void {
    const had = this.rows.length > 0 || this.currentRow !== null || this.selectedRows.length > 0
    this.resetState()
    if (had) {
      this.emitStateChanged('cleared')
    }
  }

  /**
   * 静默重置行数据和选中状态，并将 requestState 重置为 Idle。
   * 不发事件、不通知订阅者——该工作由调用方负责。
   */
  resetState(): void {
    this.rows.splice(0, this.rows.length)
    this.currentRow = null
    this.currentRowIndex = null
    this.selectedRows.splice(0, this.selectedRows.length)
    this.selectedRowIndices = []
    this.requestState = RequestState.Idle
    this.loadingError = null
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
        this.selectedRows.splice(0, this.selectedRows.length, ...valid)
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
  // 事件通知（统一通道）
  // ─────────────────────────────────────────────

  /**
   * 统一发射 stateChanged 事件（带防抖优化）
   *
   * 所有状态变更均通过此方法发射，UI 和子视图共用同一事件总线。
   * 关键状态和用户交互立即触发，数据变更（rows）防抖16ms。
   */
  private emitStateChanged(changeType: ViewStateEvent['changeType'], extra?: Partial<ViewStateEvent>): void {
    const event: ViewStateEvent = {
      tableName: this.tableName,
      viewId: this.viewId,
      changeType,
      ...extra,
    }
    
    // 清除上次的防抖定时器
    if (this.stateChangedDebouncer) {
      clearTimeout(this.stateChangedDebouncer)
      // @ts-expect-error - 清理可选属性
      this.stateChangedDebouncer = undefined
    }
    
    // 关键状态和用户交互立即触发（避免 UI 延迟响应）
    // - cleared, requestState: 关键状态变化
    // - currentRow, selectedRows: 用户交互，需要即时反馈
    if (changeType === 'cleared' || 
        changeType === 'requestState' || 
        changeType === 'currentRow' || 
        changeType === 'selectedRows') {
      this.events.emit('stateChanged', event)
      return
    }
    
    // 数据变更（rows）防抖 16ms（约一帧，60fps）
    // 适用于批量更新场景，减少 UI 重绘频率
    this.stateChangedDebouncer = setTimeout(() => {
      this.events.emit('stateChanged', event)
      // @ts-expect-error - 清理可选属性
      this.stateChangedDebouncer = undefined
    }, 16)
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

    const parentRels = this.dataSet?.getParentRelations(this.tableName, this.viewId) ?? []

    for (const rel of parentRels) {
      const parentView = this.dataSet?.getView(rel.parentTable, rel.parentViewId ?? 'default')
      if (!parentView) throw new Error(`父视图 ${rel.parentTable}:${rel.parentViewId ?? 'default'} 不存在，请检查 DataSet 关系配置`)

      const handler = (evt: ViewStateEvent) => this.respondToParentChange(rel, parentView, evt)
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
   * 响应父视图状态变化（统一级联入口，SOLID：子订阅父，父不知子）
   *
   * ## 事件过滤规则（dependencyType 与 changeType 对应关系）
   *
   * `rows` 加载成功时会**静默**清空 `currentRow`/`selectedRows`，只发一个 `'rows'` 事件。
   * 因此 `'currentRow'`/`'selectedRows'` 事件只代表用户的交互行为，与数据加载无关。
   * 过滤规则如下（`'rows'`/`'cleared'` 对所有依赖类型始终相关）：
   *
   *   dep=currentRow   → 响应 ['rows','cleared','currentRow']     忽略 selectedRows
   *   dep=selectedRows → 响应 ['rows','cleared','selectedRows']   忽略 currentRow
   *   dep=allRows      → 响应 ['rows','cleared']                  忽略 currentRow/selectedRows
   *   dep=pagedRows    → 响应 ['rows','cleared']                  忽略 currentRow/selectedRows
   *   dep=unknown      → fallback：同 currentRow 规则
   *
   * ## Loading 期间父改变
   *   若本视图正在 Loading/Preparing，直接重置为 Idle 再发起新请求；
   *   loadFromServer 内部的 currentLoadRequestId 机制会自动忽略旧请求的响应（竞态安全）。
   */
  private respondToParentChange(rel: DataRelation, parentView: DataView, evt: ViewStateEvent): void {
    // requestState 是内部状态机转换，不代表数据变化，跳过
    if (evt.changeType === 'requestState') return

    // 按 dependencyType 过滤不相关事件，避免白请求风暴
    if (!this.isRelevantChangeType(rel.dependencyType, evt.changeType)) return

    // 取消待处理的级联请求
    if (this.pendingCascadeRequest) {
      this.pendingCascadeRequest.cancel()
      this.logger.debug(`取消级联请求 ${this.pendingCascadeRequest.requestId} (父视图 ${rel.parentTable}:${rel.parentViewId ?? 'default'} 变化)`)
      this.pendingCascadeRequest = undefined
    }

    const parentRows = getParentRows(parentView, rel.dependencyType)

    if (!parentRows.length) {
      this.resetState()
      this.emitStateChanged('cleared')
      return
    }

    if (rel.autoLoad !== false) {
      // Loading/Preparing 时直接重置为 Idle，requestData() 会发起新请求；
      // loadFromServer 的 currentLoadRequestId 机制会忽略旧请求的响应（竞态安全）
      this.requestState = RequestState.Idle

      // 创建可取消的级联请求
      const requestId = ++this.nextCascadeRequestId
      let cancelled = false

      // 走完整的 requestData() 编排（含父依赖检查）
      void this.requestData()
        .then(() => {
          if (!cancelled && this.pendingCascadeRequest?.requestId === requestId) {
            this.pendingCascadeRequest = undefined
          }
        })
        .catch(err => {
          if (!cancelled) {
            this.logger.error(`级联加载 ${this.tableName}:${this.viewId} 失败 [${requestId}]`, err)
          }
        })

      // 保存请求信息以便取消
      this.pendingCascadeRequest = {
        requestId,
        cancel: () => { cancelled = true }
      }
    }
  }

  /**
   * 判断给定 changeType 是否与当前 dependencyType 相关
   *
   * - 'rows' / 'cleared' 始终相关（父数据重置时无论依赖类型都需要响应）
   * - 'currentRow'  仅与 dep=currentRow 或 unknown fallback 相关
   * - 'selectedRows' 仅与 dep=selectedRows 相关
   */
  private isRelevantChangeType(dep: string, changeType: ViewStateEvent['changeType']): boolean {
    if (changeType === 'rows' || changeType === 'cleared') return true
    switch (dep) {
      case 'currentRow':   return changeType === 'currentRow'
      case 'selectedRows': return changeType === 'selectedRows'
      case 'allRows':
      case 'pagedRows':    return false
      default:             return changeType === 'currentRow'  // fallback: currentRow 语义
    }
  }

  // ─────────────────────────────────────────────
  // CRUD 服务私有辅助
  // ─────────────────────────────────────────────

  /** 懒初始化 CrudService（从 DataTable 的 api 配置创建） */
  private initializeCrudService(): void {
    if (!this.dataTable?.api) return
    this.crudService = createCrudService(this.dataTable.api)
  }

  /** 获取 CRUD 操作配置（超时、重试等） */
  private getCrudConfig(): CrudOperationConfig | undefined {
    return this.dataTable?.crudConfig
  }

  /** 校验数据行（如果 DataTable 配置了 validator） */
  private validateRow(row: IDataRow): ValidationResult | null {
    if (!this.dataTable?.validator) return null
    return this.dataTable.validator.validate(row)
  }

  /** 确保 CrudService 已初始化，否则抛出；返回实例供调用方直接使用 */
  private ensureCrudService(): CrudService {
    if (!this.crudService) this.initializeCrudService()
    if (!this.crudService) throw new Error(`Table ${this.tableName} has no API configuration`)
    return this.crudService
  }

  // ─────────────────────────────────────────────
  // 销毁与内存管理
  // ─────────────────────────────────────────────

  /**
   * 销毁视图，清理所有订阅和引用
   * 应在组件 onUnmounted 时调用，防止内存泄漏
   */
  destroy(): void {
    if (this._isDestroyed) return
    
    this.logger.debug(`销毁 DataView: ${this.tableName}:${this.viewId}`)
    
    // 1. 清理级联订阅
    this.teardownCascade()
    
    // 2. 取消待处理的请求
    if (this.pendingCascadeRequest) {
      this.pendingCascadeRequest.cancel()
      this.pendingCascadeRequest = undefined
    }
    
    // 3. 清除防抖定时器
    if (this.stateChangedDebouncer) {
      clearTimeout(this.stateChangedDebouncer)
      // @ts-expect-error - 清理可选属性
      this.stateChangedDebouncer = undefined
    }
    
    // 3. 清理事件监听器（如果支持）
    // Note: IEventEmitter 接口目前不支持 removeAllListeners，跳过此步
    // TODO: 如需要清理监听器，需要扩展 IEventEmitter 接口
    
    // 4. 清理 CRUD 服务（设为 undefined）
    // @ts-expect-error - 清理可选属性
    this.crudService = undefined
    
    // 5. 清空数据
    this.resetState()
    
    // 6. 清除 TreeManager 引用
    // @ts-expect-error - 清理可选属性
    this.treeManager = undefined
    
    // 7. 清除 DataTable 引用（打破循环引用）
    // @ts-expect-error - 需要清理引用以防止内存泄漏
    this.dataTable = undefined
    
    // 8. 标记为已销毁
    this._isDestroyed = true
  }

  /**
   * 检查视图是否已销毁
   */
  isDestroyed(): boolean {
    return this._isDestroyed
  }

  /**
   * 检查销毁状态，已销毁则抛出异常
   * @private 内部方法，关键操作前调用
   */
  private checkDestroyed(): void {
    if (this._isDestroyed) {
      throw new Error(`DataView ${this.tableName}:${this.viewId} has been destroyed`)
    }
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
