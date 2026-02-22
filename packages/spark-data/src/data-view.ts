/**
 * DataView — 数据视图，SPARK 数据层的统一交互枢纽
 *
 * ## 对象引用链
 *   DataView → DataTable → DataSet
 *   DataView 通过 `dataTable` 持有对 DataTable 的引用，
 *   并以 getter（crudService / crudConfig / validator / dataSet）
 *   向委托层暴露所需属性，实现 ICrudHost / ICascadeHost 接口。
 *
 * ## 级联加载（SOLID：子订阅父，父不知子）
 *   子视图通过 setupCascade() 订阅父视图的 stateChanged 事件，
 *   父状态变化时子视图自行决定：清空 or 重新请求。
 *
 * ## 请求编排
 *   requestData()   —— 上行入口（幂等、非阻塞）：解析父依赖 → 调用 loadFromServer → 子视图级联
 *   refresh()       —— 下行入口（强制、非阻塞）：重置 Idle → 调用 requestData()
 *   两者均立即返回，结果通过 stateChanged 事件通知；loadFromServer() 可 await（有返回值）
 *   requestState    —— 唯一状态源（RequestState 枚举），禁止另设布尔别名
 *
 * ## 委托分工
 *   CrudDelegate    —— 单条 / 批量 CRUD、校验、生命周期钩子、mutating 状态
 *   CascadeDelegate —— 父视图依赖订阅 / 响应 / 防抖级联
 */

import type {
  IDataRow, IViewMetadata, FilterExpression, SortExpression,
  ViewStateEvent, QueryParams,
  CrudResult, BatchResult, CrudOperationConfig,
  IDataSource,
} from './types'
import { RequestState } from './types'
import type { TreeManager } from './tree-manager'
import type { DataTable } from './data-table'
import type { CrudService } from './crud-service'
import type { DataValidator } from './validation'
import { Logger, createEventEmitter } from '@spark-view/spark-utils'
import type { IEventEmitter } from '@spark-view/spark-utils'
import { isSameRow, getParentRows } from './core/utils'
import { CrudDelegate } from './strategies/crud-delegate'
import { CascadeDelegate } from './strategies/cascade-delegate'
import type { CrudLifecycleEvent } from './strategies/types'

// ─────────────────────────────────────────────
// 事件类型映射
// ─────────────────────────────────────────────

/**
 * DataView 事件映射（用于 events 事件总线类型约束）
 */
// Note: any[] 在此处是合理的泛型约束（与 IEventEmitter 接口保持一致）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface DataViewEventMap extends Record<string, any[]> {
  stateChanged: [ViewStateEvent]
  /** CRUD 提交前事件——业务脚本可调用 event.cancel() 取消操作 */
  'crud:before': [CrudLifecycleEvent]
  /** CRUD 提交后事件——业务脚本可根据 result 执行联动 */
  'crud:after': [CrudLifecycleEvent]
}

// ─────────────────────────────────────────────
// 能力接口（避免循环引用，与类同文件定义）
// ─────────────────────────────────────────────

// RequestState 已移至 types.ts，此处重新导出以保持向后兼容
export { RequestState } from './types'

// ─────────────────────────────────────────────
// DataView 类
// ─────────────────────────────────────────────

export class DataView implements IDataSource {

  // ── DataTable 引用（运行时注入，由 DataTable 在 attach 时赋值）────────

  /** 所属 DataTable */
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
  /** 增删改批网络请求进行中（与 requestState 独立，可同时为 true） */
  mutating: boolean = false
  /** 最近一次增删改批操作的错误；成功或未发起时为 null */
  mutatingError: Error | null = null

  // ── 视图配置 ────────────────────────────────

  filterExpression?: FilterExpression
  sortExpression?: SortExpression
  /**
   * 请求成功后是否自动将 currentRow 设为第一行。
   * - `true`：有数据时 currentRow = rows[0]
   * - `false`（默认）：清空 currentRow
   */
  autoCurrentFirst?: boolean
  /**
   * 请求成功后是否自动将 selectedRows 设为第一行。
   * - `true`：有数据时 selectedRows = [rows[0]]
   * - `false`（默认）：清空 selectedRows
   */
  autoSelectFirst?: boolean

  // ── 关联对象 ────────────────────────────────

  treeManager?: TreeManager | undefined

  // ── 私有 ─────────────────────────────────────

  /** 当前 loadFromServer 请求 ID（用于防止竞态） */
  private currentLoadRequestId = 0
  /** 并发 CRUD 请求计数器（支持多操作同时在途） */
  private _mutatingCount = 0
  /** 销毁状态标记 */
  private _isDestroyed = false
  /** 行索引缓存（用于加速 setSelectedRows，O(n) 而非 O(n²)） */
  private rowIndexMap?: Map<IDataRow, number> | undefined
  /** stateChanged 事件防抖定时器 */
  private stateChangedDebouncer?: ReturnType<typeof setTimeout> | undefined

  // ── 委托 ─────────────────────────────────────

  /** CRUD 操作委托（懒初始化） */
  private _crudDelegate?: CrudDelegate | undefined
  /** 级联订阅委托（懒初始化） */
  private _cascadeDelegate?: CascadeDelegate | undefined

  /** 获取 CRUD 委托（懒初始化） */
  private get crudDelegate(): CrudDelegate {
    this._crudDelegate ??= new CrudDelegate(
      this,
      (changeType, extra) => this.emitStateChanged(changeType, extra),
      (event) => this.events.emit(
        event.phase === 'before' ? 'crud:before' : 'crud:after',
        event,
      ),
      (delta, error) => this._trackMutating(delta, error),
    )
    return this._crudDelegate
  }

  /** 获取级联委托（懒初始化） */
  private get cascadeDelegate(): CascadeDelegate {
    this._cascadeDelegate ??= new CascadeDelegate(
      this,
      (changeType, extra) => this.emitStateChanged(changeType, extra)
    )
    return this._cascadeDelegate
  }
  
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

  // ─────────────────────────────────────────────
  // 接口实现 getter（ICrudHost / ICascadeHost）
  // 将 DataTable 属性转发给委托层，委托层不持有 DataTable 直接引用
  // ─────────────────────────────────────────────

  /** ICascadeHost：向上访问 DataSet，供 CascadeDelegate 解析父子关系 */
  get dataSet() {
    return this.dataTable.dataSet
  }

  /** ICrudHost：CrudService 实例（DataTable 持有并缓存；未配置 API 时为 undefined） */
  get crudService(): CrudService | undefined { return this.dataTable.crudService }
  /** ICrudHost：CRUD 操作全局配置（超时、重试等） */
  get crudConfig(): CrudOperationConfig | undefined { return this.dataTable.crudConfig }
  /** ICrudHost：数据校验器 */
  get validator(): DataValidator | undefined { return this.dataTable.validator }

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
    const parents = this.dataSet.getParentRelations(this.tableName, this.viewId) ?? []
    for (const rel of parents) {
      const pView = this.dataSet.getView(rel.parentTable, rel.parentViewId ?? 'default')
      if (!pView) continue

      if (pView.requestState === RequestState.Idle) {
        void pView.requestData()
      }

      const parentRows = getParentRows(pView, rel.dependencyType)
      // 用 rows.length 而非 requestState===Loaded 判断就绪，兼容父视图处于 Loaded/Idle 两种终态
      const parentReady = pView.requestState === RequestState.Loading || pView.rows.length > 0
      if (!parentReady || parentRows.length === 0) {
        this.requestState = RequestState.Failed
        this.emitStateChanged('requestState')
        return
      }
    }

    // 按各关系的 filterExpression 组装查询参数
    const params: QueryParams = {}
    for (const rel of parents) {
      const pView = this.dataSet.getView(rel.parentTable, rel.parentViewId ?? 'default')
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

    try {
      const result = await this.loadFromServer(params)
      if (!result.success) return
    } catch {
      return
    }

    // 子视图级联由 stateChanged('rows') 事件驱动（respondToParentChange），无需主动推
  }

  /**
   * 从服务器拉取列表（带防重入 + 请求 ID 竞态保护）
   *
   * 通常由 `requestData()` 内部调用；也可直接调用以跳过父依赖编排。
   *
   * - 成功：updateFromServer() 写入行数据，处理 autoCurrentFirst/autoSelectFirst，
   *         requestState=Loaded，发射 stateChanged('rows')
   * - 失败：requestState=Failed，发射 stateChanged('requestState')，重新抛出异常
   * - 竞态：requestId 不匹配时静默丢弃（旧请求晚于新请求到达）
   */
  async loadFromServer(params?: QueryParams): Promise<CrudResult> {
    this.checkDestroyed()
    if (this.requestState === RequestState.Loading) return { success: false, message: 'Already loading' }

    this.requestState = RequestState.Loading
    this.loadingError = null
    
    const requestId = ++this.currentLoadRequestId

    try {
      const result = await this.crudDelegate.list(params)
      
      if (requestId !== this.currentLoadRequestId) {
        this.logger.debug(`loadFromServer 请求 ${requestId} 被更新的请求 ${this.currentLoadRequestId} 替代，忽略响应`)
        return { success: false, message: 'Request superseded' }
      }
      
      if (result.success && result.data) {
        this.updateFromServer(result.data as { rows?: IDataRow[]; total?: number; page?: number; pageSize?: number } | IDataRow[])
        const firstRow = this.rows.length > 0 ? this.rows[0] : null
        if (this.autoCurrentFirst && firstRow) {
          this.currentRow = firstRow
          this.currentRowIndex = 0
        } else {
          this.currentRow = null
          this.currentRowIndex = null
        }
        if (this.autoSelectFirst && firstRow) {
          this.selectedRows.splice(0, this.selectedRows.length, firstRow)
          this.selectedRowIndices = [0]
        } else {
          this.selectedRows.splice(0, this.selectedRows.length)
          this.selectedRowIndices = []
        }
        this.requestState = RequestState.Loaded
        this.emitStateChanged('rows')
      } else {
        this.requestState = RequestState.Failed
        this.emitStateChanged('requestState')
      }
      return result
    } catch (error) {
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
  // CRUD 写操作（委托给 CrudDelegate）
  // mutating 状态由 CrudDelegate 通过 _trackMutating 回调维护
  // ─────────────────────────────────────────────

  /** 新增记录，成功后追加至 rows */
  async createRecord(data: Partial<IDataRow>): Promise<CrudResult<IDataRow>> {
    return this.crudDelegate.createRecord(data)
  }

  /** 更新记录，成功后刷新对应行 */
  async updateRecord(id: string | number, data: Partial<IDataRow>): Promise<CrudResult<IDataRow>> {
    return this.crudDelegate.updateRecord(id, data)
  }

  /** 删除记录，成功后从 rows 移除 */
  async deleteRecord(id: string | number): Promise<CrudResult<boolean>> {
    return this.crudDelegate.deleteRecord(id)
  }

  /** 批量新增 */
  async batchCreateRecords(items: Partial<IDataRow>[]): Promise<CrudResult<BatchResult>> {
    return this.crudDelegate.batchCreateRecords(items)
  }

  /** 批量更新 */
  async batchUpdateRecords(items: Array<{ id: string | number } & Partial<IDataRow>>): Promise<CrudResult<BatchResult>> {
    return this.crudDelegate.batchUpdateRecords(items)
  }

  /** 批量删除 */
  async batchDeleteRecords(ids: Array<string | number>): Promise<CrudResult<BatchResult>> {
    return this.crudDelegate.batchDeleteRecords(ids)
  }

  /** 导入文件，成功后重置状态并重新走完整编排 */
  async importData(file: File): Promise<CrudResult<{ imported: number; failed: number }>> {
    return this.crudDelegate.importData(file)
  }

  /** 导出数据 */
  async exportData(params?: QueryParams): Promise<CrudResult<Blob>> {
    return this.crudDelegate.exportData(params)
  }

  /**
   * 强制刷新（下行触发）
   *
   * 与 `requestData()` 的区别：
   * - `requestData()` —— 上行请求，有幂等守卫（仅 Idle 状态才执行）
   * - `refresh()` —— 下行刷新，先将状态置为 Idle，再调用 `requestData()`，无论当前状态一律重新拉取
   *
   * 注意：不清空现有 rows，刷新完成前原数据仍可读取（Loaded 状态被重置为 Idle 后重新请求）。
   * 如需同时清空数据，请先调用 `resetState()`。
   *
   * 适用场景：父视图数据变化后，CascadeDelegate 触发子视图级联更新。
   */
  async refresh(): Promise<void> {
    this.requestState = RequestState.Idle
    return this.requestData()
  }

  // ─────────────────────────────────────────────
  // 行数据操作（内存同步，不触发网络请求）
  // ─────────────────────────────────────────────

  /** 将服务端响应同步到本地字段（rows / total / page / pageSize）——splice 保持数组引用稳定，对 Vue 响应式友好 */
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
      this.stateChangedDebouncer = undefined
    }
    
    // 关键状态和用户交互立即触发（避免 UI 延迟响应）
    // - cleared, requestState, mutating: 关键状态变化
    // - currentRow, selectedRows: 用户交互，需要即时反馈
    if (changeType === 'cleared' || 
        changeType === 'requestState' || 
        changeType === 'mutating' ||
        changeType === 'currentRow' || 
        changeType === 'selectedRows') {
      this.events.emit('stateChanged', event)
      return
    }
    
    // 数据变更（rows）防抖 16ms（约一帧，60fps）
    // 适用于批量更新场景，减少 UI 重绘频率
    this.stateChangedDebouncer = setTimeout(() => {
      this.events.emit('stateChanged', event)
      this.stateChangedDebouncer = undefined
    }, 16)
  }

  // ─────────────────────────────────────────────
  // 级联订阅（委托给 CascadeDelegate）
  // ─────────────────────────────────────────────

  /** 建立级联监听 */
  setupCascade(): void {
    this.cascadeDelegate.setupCascade()
  }

  /** 清理全部级联订阅 */
  teardownCascade(): void {
    this.cascadeDelegate.teardownCascade()
  }

  // ─────────────────────────────────────────────
  // 生命周期（销毁与内存管理）
  // ─────────────────────────────────────────────

  /**
   * 销毁视图，释放所有订阅、委托和外部引用
   *
   * 应在组件 `onUnmounted` 时调用，防止内存泄漏。
   * 销毁顺序：级联委托 → CRUD 委托 → 防抖定时器 → 事件总线 → 行数据 → TreeManager → DataTable 引用
   */
  destroy(): void {
    if (this._isDestroyed) return
    
    this.logger.debug(`销毁 DataView: ${this.tableName}:${this.viewId}`)
    
    // 1. 销毁级联委托（清理订阅 + 取消待处理请求）
    this._cascadeDelegate?.destroy()
    this._cascadeDelegate = undefined
    
    // 2. 销毁 CRUD 委托（释放 CrudService）
    this._crudDelegate?.destroy()
    this._crudDelegate = undefined
    
    // 3. 清除防抖定时器
    if (this.stateChangedDebouncer) {
      clearTimeout(this.stateChangedDebouncer)
      this.stateChangedDebouncer = undefined
    }
    
    // 4. 清理事件监听器（Batch 2 已扩展 IEventEmitter.removeAllListeners）
    this.events.removeAllListeners()
    
    // 5. 清空数据
    this.resetState()
    
    // 6. 清除 TreeManager 引用
    this.treeManager = undefined
    
    // 7. 清除 DataTable 引用（打破循环引用，防止内存泄漏）
    // 作为 DataView 生命周期的最终清理步骤，需要在运行时断开与 DataTable 的关联。
    // 类型声明维持严格契约（dataTable!: DataTable），此转换仅在 destroy() 内部使用。
    ;(this as unknown as { dataTable: DataTable | undefined }).dataTable = undefined
    
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

  /**
   * CrudDelegate 回调：追踪并发 CRUD 请求数，维护 `mutating` / `mutatingError`
   *
   * - `delta=1`  → 新请求开始，清除上次 mutatingError
   * - `delta=-1` → 请求结束，有 error 时写入 mutatingError
   * - 多操作并发时计数大于 1，计数归零才将 mutating 置 false
   */
  private _trackMutating(delta: 1 | -1, error?: Error | null): void {
    this._mutatingCount = Math.max(0, this._mutatingCount + delta)
    this.mutating = this._mutatingCount > 0
    if (delta === 1) {
      this.mutatingError = null
    } else {
      if (error) this.mutatingError = error
    }
    this.emitStateChanged('mutating')
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
    if (this.autoCurrentFirst !== undefined) result.autoCurrentFirst = this.autoCurrentFirst
    if (this.autoSelectFirst !== undefined) result.autoSelectFirst = this.autoSelectFirst
    return result
  }

  static fromData(data: IViewMetadata, tableName: string, viewId: string): DataView {
    const v = new DataView(tableName, viewId)
    if (data.filterExpression !== undefined) v.filterExpression = data.filterExpression
    if (data.sortExpression !== undefined) v.sortExpression = data.sortExpression
    if (data.autoCurrentFirst !== undefined) v.autoCurrentFirst = data.autoCurrentFirst
    if (data.autoSelectFirst !== undefined) v.autoSelectFirst = data.autoSelectFirst
    v.page = data.page ?? 1
    v.pageSize = data.pageSize ?? 20
    return v
  }
}
