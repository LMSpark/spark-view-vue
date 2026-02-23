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
  EventContext,
} from './types'
import { RequestState, createEventContext } from './types'
import type { TreeManager } from './tree-manager'
import type { DataTable } from './data-table'
import type { CrudService } from './crud-service'
import type { DataValidator } from './validation'
import { Logger, createEventEmitter } from '@spark-view/spark-utils'
import { bus } from './event-bus'
import type { IEventEmitter } from '@spark-view/spark-utils'
import { isSameRow, getParentRows } from './core/utils'
import { CrudDelegate } from './strategies/crud-delegate'
import { CascadeDelegate } from './strategies/cascade-delegate'
import type { CrudLifecycleEvent } from './strategies/types'
import type { PrimaryKeyGenerator, PrimaryKeyGeneratorConfig } from './core/primary-key-generator'
import { createPrimaryKeyGenerator } from './core/primary-key-generator'

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

  /** 主键字段名（支持单主键字符串或多主键数组），用于 SELECTION 能力的 ID 定位（默认 'id'） */
  primaryKey: string | string[] = 'id'
  
  /** 主键生成器（可选，用于自动生成新记录的主键） */
  private primaryKeyGenerator?: PrimaryKeyGenerator | undefined

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
   * - `true`（默认）：有数据时 currentRow = rows[0]
   * - `false`：清空 currentRow
   */
  autoCurrentFirst: boolean = true
  /**
   * 请求成功后是否自动将 selectedRows 设为第一行。
   * - `true`（默认）：有数据时 selectedRows = [rows[0]]
   * - `false`：清空 selectedRows
   */
  autoSelectFirst: boolean = true
  

  // ── 关联对象 ────────────────────────────────

  treeManager?: TreeManager | undefined

  // ── 私有 ─────────────────────────────────────

  /**
   * 创建本视图的 'program' 来源事件上下文（私有快捷方式，减少重复代码）
   * 每次调用生成新的 eventId，确保唯一性。
   */
  private _mkCtx(): import('./types').EventContext {
    return createEventContext('program', { tableName: this.tableName, viewId: this.viewId })
  }

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
  // 主键辅助方法
  // ─────────────────────────────────────────────

  /**
   * 获取行的主键值（用于 Map/Set 键）
   * 
   * - 单主键：返回字段值（string | number）
   * - 多主键：返回连接字符串（格式："value1:value2:value3"）
   * 
   * @param row 数据行
   * @returns 主键值，如果主键字段不存在则返回 undefined
   */
  getPrimaryKeyValue(row: IDataRow): string | number | undefined {
    if (typeof this.primaryKey === 'string') {
      const value = row[this.primaryKey]
      if (value === undefined || value === null) return undefined
      if (typeof value === 'string' || typeof value === 'number') return value
      return undefined
    }
    
    // 多主键：连接所有字段值
    const values: Array<string | number> = []
    for (const field of this.primaryKey) {
      const value = row[field]
      if (value === undefined || value === null) return undefined
      if (typeof value !== 'string' && typeof value !== 'number') return undefined
      values.push(value)
    }
    return values.join(':')
  }

  /**
   * 检查两行是否有相同的主键
   * 
   * @param row1 第一行
   * @param row2 第二行
   * @returns 是否相同
   */
  isSamePrimaryKey(row1: IDataRow, row2: IDataRow): boolean {
    return isSameRow(row1, row2, this.primaryKey)
  }

  /**
   * 配置主键生成器
   * 
   * @param config 主键生成器配置
   * 
   * @example
   * ```ts
   * // 雪花ID生成器
   * view.setPrimaryKeyGenerator({
   *   strategy: 'snowflake',
   *   fields: 'id',
   *   snowflake: {
   *     workerId: 1,
   *     datacenterId: 1
   *   }
   * })
   * 
   * // UUID生成器
   * view.setPrimaryKeyGenerator({
   *   strategy: 'uuid',
   *   fields: 'id'
   * })
   * 
   * // 自增ID
   * view.setPrimaryKeyGenerator({
   *   strategy: 'auto-increment',
   *   fields: 'id',
   *   startValue: 1000
   * })
   * ```
   */
  setPrimaryKeyGenerator(config: PrimaryKeyGeneratorConfig): void {
    this.primaryKeyGenerator = createPrimaryKeyGenerator(config)
  }

  /**
   * 移除主键生成器
   */
  removePrimaryKeyGenerator(): void {
    this.primaryKeyGenerator = undefined
  }

  /**
   * 为新记录生成主键值
   * 
   * @param row 部分数据行（可能已包含部分字段值）
   * @returns 包含主键的数据行
   * 
   * @throws 如果未配置主键生成器
   */
  generatePrimaryKey(row: Partial<IDataRow>): IDataRow {
    if (!this.primaryKeyGenerator) {
      throw new Error('未配置主键生成器，请先调用 setPrimaryKeyGenerator()')
    }
    
    const pkValue = this.primaryKeyGenerator.generate(row, this.rows)
    
    // 单主键
    if (typeof this.primaryKey === 'string') {
      return { ...row, [this.primaryKey]: pkValue } as IDataRow
    }
    
    // 复合主键
    if (typeof pkValue === 'object' && pkValue !== null) {
      return { ...row, ...pkValue } as IDataRow
    }
    
    throw new Error('主键生成器返回值类型与配置不匹配')
  }

  /**
   * 为新记录生成主键值（如果配置了生成器且行中缺少主键）
   * 
   * @param row 部分数据行
   * @returns 包含主键的数据行（如果需要生成）或原始数据（如果已有主键）
   */
  ensurePrimaryKey(row: Partial<IDataRow>): IDataRow {
    // 未配置生成器：返回原始数据
    if (!this.primaryKeyGenerator) {
      return row as IDataRow
    }
    
    // 检查是否已有主键值
    const fields = typeof this.primaryKey === 'string' ? [this.primaryKey] : this.primaryKey
    const hasPrimaryKey = fields.every(field => {
      const value = row[field]
      return value !== undefined && value !== null
    })
    
    // 已有主键：返回原始数据
    if (hasPrimaryKey) {
      return row as IDataRow
    }
    
    // 生成主键
    return this.generatePrimaryKey(row)
  }

  /**
   * 获取主键生成器配置
   */
  getPrimaryKeyGeneratorConfig(): Readonly<PrimaryKeyGeneratorConfig> | undefined {
    return this.primaryKeyGenerator?.getConfig()
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
        this._applyAutoFirst()
        this.requestState = RequestState.Loaded
        this.emitStateChanged('requestState')   // 通知 Idle→Loading→Loaded 转换（DataSet.on('loadSuccess') 依赖此事件）
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
  // 本地 CRUD（内存同步，不触发网络请求）
  // 可独立调用；CrudDelegate 也通过这些方法写入数据，
  // 两者均发射 stateChanged('rows')，因防抖合并为单次通知
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

  /** 本地追加一行，发射 stateChanged('rows') */
  appendRow(row: IDataRow): void {
    this.rows.push(row)
    this.rowIndexMap = undefined   // 新行未加入缓存，直接失效
    this.emitStateChanged('rows')
  }

  /** 本地按主键部分更新一行，发射 stateChanged('rows')；返回是否成功（行不存在时 false） */
  updateRowById(id: string | number, data: Partial<IDataRow>): boolean {
    const idx = this.rows.findIndex(r => {
      const pkValue = this.getPrimaryKeyValue(r)
      return pkValue === id
    })
    if (idx < 0) return false
    
    const oldRow = this.rows[idx]
    if (!oldRow) return false
    
    const newRow = { ...oldRow, ...data }
    this.rows[idx] = newRow
    this.rowIndexMap = undefined   // 行引用已替换，缓存失效

    const ctx = this._mkCtx()
    // 同步更新选中状态的引用，并发射对应事件（引用已变，UI 需感知）
    if (this.currentRow && this.isSamePrimaryKey(this.currentRow, oldRow)) {
      this.currentRow = newRow
      this.emitStateChanged('currentRow', { row: newRow, context: ctx })
      bus.emit('view:currentRow', { tableName: this.tableName, viewId: this.viewId, row: newRow, context: ctx })
    }
    
    if (this.selectedRows.length > 0) {
      const selectedIdx = this.selectedRows.findIndex(r => this.isSamePrimaryKey(r, oldRow))
      if (selectedIdx !== -1) {
        this.selectedRows[selectedIdx] = newRow
        this.emitStateChanged('selectedRows', { rows: [...this.selectedRows], context: ctx })
        bus.emit('view:selectedRows', { tableName: this.tableName, viewId: this.viewId, rows: [...this.selectedRows], context: ctx })
      }
    }
    
    this.emitStateChanged('rows')
    return true
  }

  /** 本地按主键删除一行，清理选中引用，发射 stateChanged('rows')；返回是否成功（行不存在时 false） */
  deleteRowById(id: string | number): boolean {
    const idx = this.rows.findIndex(r => {
      const pkValue = this.getPrimaryKeyValue(r)
      return pkValue === id
    })
    if (idx < 0) return false
    
    const deletedRow = this.rows[idx]
    if (!deletedRow) return false
    
    this.rows.splice(idx, 1)
    // splice 后重建索引 Map（O(n))，供删除后 selectedRowIndices 更新复用（O(1) vs O(n) indexOf）
    const postDeleteMap = new Map(this.rows.map((r, i) => [r, i] as [IDataRow, number]))
    this.rowIndexMap = postDeleteMap

    const ctx = this._mkCtx()
    // 被删行是当前行 → 清空并立即通知
    if (this.currentRow && this.isSamePrimaryKey(this.currentRow, deletedRow)) {
      this.currentRow = null
      this.currentRowIndex = null
      this.emitStateChanged('currentRow', { row: null, context: ctx })
      bus.emit('view:currentRow', { tableName: this.tableName, viewId: this.viewId, row: null, context: ctx })
    }
    
    // 被删行在多选中 → 移除并立即通知
    if (this.selectedRows.length > 0) {
      const newSelected = this.selectedRows.filter(r => !this.isSamePrimaryKey(r, deletedRow))
      if (newSelected.length !== this.selectedRows.length) {
        this.selectedRows.splice(0, this.selectedRows.length, ...newSelected)
        // postDeleteMap 已在上方构建，O(1) 查找代替 O(n) indexOf
        this.selectedRowIndices = newSelected.map(r => postDeleteMap.get(r) ?? -1).filter(i => i !== -1)
        this.emitStateChanged('selectedRows', { rows: [...this.selectedRows], context: ctx })
        bus.emit('view:selectedRows', { tableName: this.tableName, viewId: this.viewId, rows: [...this.selectedRows], context: ctx })
      }
    }
    
    this.emitStateChanged('rows')
    return true
  }

  /** 本地整批替换所有行（响应式安全），清理无效选中引用，发射 stateChanged('rows') */
  replaceRows(rows: IDataRow[]): void {
    this.rows.splice(0, this.rows.length, ...rows)
    // O(n) 构建索引 Map，供后续 selectedRowIndices 计算和 setSelectedRows 复用
    const idxMap = new Map(rows.map((r, i) => [r, i] as [IDataRow, number]))
    this.rowIndexMap = idxMap
    // 行集合完全替换，旧引用失效 → 清理选中状态并通知
    const ctx = this._mkCtx()
    const rowSet = new Set(rows)
    if (this.currentRow && !rowSet.has(this.currentRow)) {
      this.currentRow = null
      this.currentRowIndex = null
      this.emitStateChanged('currentRow', { row: null, context: ctx })
      bus.emit('view:currentRow', { tableName: this.tableName, viewId: this.viewId, row: null, context: ctx })
    }
    if (this.selectedRows.length > 0) {
      const newSelected = this.selectedRows.filter(r => rowSet.has(r))
      if (newSelected.length !== this.selectedRows.length) {
        this.selectedRows.splice(0, this.selectedRows.length, ...newSelected)
        // idxMap 已在函数头部构建，O(1) 查找代替 O(n) indexOf
        this.selectedRowIndices = newSelected.map(r => idxMap.get(r) ?? -1).filter(i => i !== -1)
        this.emitStateChanged('selectedRows', { rows: [...this.selectedRows], context: ctx })
        bus.emit('view:selectedRows', { tableName: this.tableName, viewId: this.viewId, rows: [...this.selectedRows], context: ctx })
      }
    }
    this.emitStateChanged('rows')
  }

  // ─────────────────────────────────────────────
  // 选中状态
  // ─────────────────────────────────────────────

  /**
   * 数据加载完成后应用 autoCurrentFirst / autoSelectFirst 逻辑。
   *
   * updateFromServer() 替换了全部行引用，旧的 currentRow/selectedRows 指针已失效。
   * 先强制清零（无事件），再通过正式 setter 写入新值；setter 会同时触发
   * this.events（stateChanged）和全局 bus（view:currentRow / view:selectedRows），
   * useRuleBinding 等订阅者因此能正确收到事件。
   */
  private _applyAutoFirst(): void {
    const prevCurrentRow = this.currentRow
    const prevHadSelected = this.selectedRows.length > 0
    this.currentRow = null
    this.currentRowIndex = null
    this.selectedRows.splice(0, this.selectedRows.length)
    this.selectedRowIndices = []
    this.rowIndexMap = undefined

    const firstRow = this.rows[0] ?? null
    const autoCtx = createEventContext('auto', { tableName: this.tableName, viewId: this.viewId })

    if (this.autoCurrentFirst !== false && firstRow) {
      this.setCurrentRow(firstRow, autoCtx)   // guard: null !== firstRow → always fires
    } else if (prevCurrentRow !== null) {
      // autoCurrentFirst=false 或无数据：当前行被强制清零，仍需通知 bus（el-table 高亮清除）
      this.emitStateChanged('currentRow', { row: null, context: autoCtx })
      bus.emit('view:currentRow', { tableName: this.tableName, viewId: this.viewId, row: null, context: autoCtx })
    }
    if (this.autoSelectFirst !== false && firstRow) {
      this.setSelectedRows([firstRow], autoCtx)  // guard: [] !== [firstRow] → always fires
    } else if (prevHadSelected) {
      // autoSelectFirst=false 或无数据：已选行被强制清零，仍需通知 bus
      this.emitStateChanged('selectedRows', { rows: [], context: autoCtx })
      bus.emit('view:selectedRows', { tableName: this.tableName, viewId: this.viewId, rows: [], context: autoCtx })
    }
  }

  /**
   * 设置当前行
   * 状态变更 → 发射 stateChanged → UI + 子视图级联均通过 events 接收
   * 
   * @param row - 要设置的行（null 表示清空）
   */
  setCurrentRow(row: IDataRow | null, context?: EventContext): void {
    if (this.currentRow === row) return
    
    this.currentRow = row
    this.currentRowIndex = row === null ? null : this.rows.indexOf(row)
    if (this.currentRowIndex === -1) this.currentRowIndex = null
    
    // 使用调用方传入的上下文（携带 source='ui'/'sync' 等），否则默认 'program'
    const eventContext = context ?? this._mkCtx()
    this.emitStateChanged('currentRow', { row, context: eventContext })
    bus.emit('view:currentRow', { tableName: this.tableName, viewId: this.viewId, row, context: eventContext })
  }

  /**
   * 设置多选行（幂等：内容不变时跳过）
   * 
   * @param rows - 要设置的行数组
   */
  setSelectedRows(rows: IDataRow[], context?: EventContext): void {
    // 防御性检查，确保 rows 是有效数组（el-table 事件可能传入非数组）
    if (!Array.isArray(rows)) {
      this.logger.warn('setSelectedRows 收到非数组参数', { rows, tableName: this.tableName, viewId: this.viewId })
      return
    }
    
    const cur = this.selectedRows
    if (cur.length === rows.length && cur.every((r, i) => r === rows[i])) return
    
    this.selectedRows.splice(0, this.selectedRows.length, ...rows)
    
    // 使用 Map 加速索引查找（O(n) 而非 O(n²)）
    this.rowIndexMap ??= new Map(this.rows.map((r, i) => [r, i]))
    
    this.selectedRowIndices = rows
      .map(r => this.rowIndexMap?.get(r) ?? -1)
      .filter(i => i !== -1)
    
    const eventContext = context ?? this._mkCtx()
    this.emitStateChanged('selectedRows', { rows: [...rows], context: eventContext })
    bus.emit('view:selectedRows', { tableName: this.tableName, viewId: this.viewId, rows: [...rows], context: eventContext })
  }

  /**
   * 根据主键设置当前行
   * 
   * @param id - 主键值
   * @returns 是否成功（行不存在时返回 false）
   */
  setCurrentRowById(
    id: string | number,
    context?: EventContext
  ): boolean {
    this.checkDestroyed()

    // 根据主键查找行
    const row = this.rows.find(r => this.getPrimaryKeyValue(r) === id)
    
    if (!row) {
      this.logger.warn('setCurrentRowById: 行不存在', {
        tableName: this.tableName,
        viewId: this.viewId,
        primaryKey: this.primaryKey,
        id,
        totalRows: this.rows.length
      })
      return false
    }
    
    this.setCurrentRow(row, context)
    return true
  }

  /**
   * 根据主键数组设置多选行
   * 
   * @param ids - 主键值数组
   * @param context - 事件上下文（可选，未提供时自动生成）
   * @param options - 可选配置
   * @param options.strict - 严格模式：如果有任何 ID 找不到对应行则报错（默认 false，跳过无效 ID）
   * @returns 成功找到的行数（严格模式下找不到会抛出错误）
   */
  setSelectedRowsById(
    ids: Array<string | number>,
    context?: EventContext,
    options?: { strict?: boolean }
  ): number {
    this.checkDestroyed()
    
    // 防御性检查
    if (!Array.isArray(ids)) {
      this.logger.warn('setSelectedRowsById 收到非数组参数', { ids, tableName: this.tableName, viewId: this.viewId })
      return 0
    }
    
    // 空数组：清空选中
    if (ids.length === 0) {
      this.setSelectedRows([], context)
      return 0
    }
    
    // 构建主键到行的映射（O(n) 一次性构建）
    const idToRow = new Map<string | number, IDataRow>()
    for (const row of this.rows) {
      const pkValue = this.getPrimaryKeyValue(row)
      if (pkValue !== undefined) {
        idToRow.set(pkValue, row)
      }
    }
    
    // 根据 ID 查找行
    const foundRows: IDataRow[] = []
    const notFoundIds: Array<string | number> = []
    
    for (const id of ids) {
      const row = idToRow.get(id)
      if (row) {
        foundRows.push(row)
      } else {
        notFoundIds.push(id)
      }
    }
    
    // 严格模式：有找不到的 ID 则报错
    if (options?.strict && notFoundIds.length > 0) {
      const error = new Error(
        `setSelectedRowsById (strict): 有 ${notFoundIds.length} 个 ID 找不到对应行`
      )
      this.logger.error('setSelectedRowsById: 严格模式下有 ID 找不到', {
        tableName: this.tableName,
        viewId: this.viewId,
        primaryKey: this.primaryKey,
        notFoundIds,
        totalRows: this.rows.length
      })
      throw error
    }
    
    // 非严格模式：记录警告
    if (notFoundIds.length > 0) {
      this.logger.warn('setSelectedRowsById: 部分 ID 找不到对应行', {
        tableName: this.tableName,
        viewId: this.viewId,
        primaryKey: this.primaryKey,
        notFoundIds,
        foundCount: foundRows.length,
        totalRows: this.rows.length
      })
    }
    
    // 设置选中行
    this.setSelectedRows(foundRows, context)
    return foundRows.length
  }

  /**
   * 清空选中行
   * 
   * @param context - 事件上下文（可选，未提供时自动生成）
   */
  clearSelectedRows(context?: EventContext): void {
    this.setSelectedRows([], context)
  }

  /**
   * 添加行到选中集（去重）
   * 
   * @param rows - 要添加的行数组
   * @param context - 事件上下文（可选，未提供时自动生成）
   * @returns 实际添加的行数
   */
  addSelectedRows(
    rows: IDataRow[],
    context?: EventContext
  ): number {
    this.checkDestroyed()
    
    // 防御性检查
    if (!Array.isArray(rows)) {
      this.logger.warn('addSelectedRows 收到非数组参数', { rows, tableName: this.tableName, viewId: this.viewId })
      return 0
    }
    
    if (rows.length === 0) return 0
    
    // 构建现有选中行的 Set（使用主键去重）
    const selectedSet = new Set(
      this.selectedRows.map(r => this.getPrimaryKeyValue(r)).filter(pk => pk !== undefined)
    )
    
    // 过滤出真正需要添加的行（不在现有选中集中）
    const toAdd = rows.filter(r => {
      const pk = this.getPrimaryKeyValue(r)
      return pk !== undefined && !selectedSet.has(pk)
    })
    
    if (toAdd.length === 0) return 0
    
    // 合并：现有选中 + 新增
    const newSelection = [...this.selectedRows, ...toAdd]
    this.setSelectedRows(newSelection, context)
    return toAdd.length
  }

  /**
   * 从选中集移除行
   * 
   * @param rows - 要移除的行数组
   * @param context - 事件上下文（可选，未提供时自动生成）
   * @returns 实际移除的行数
   */
  removeSelectedRows(
    rows: IDataRow[],
    context?: EventContext
  ): number {
    this.checkDestroyed()
    
    // 防御性检查
    if (!Array.isArray(rows)) {
      this.logger.warn('removeSelectedRows 收到非数组参数', { rows, tableName: this.tableName, viewId: this.viewId })
      return 0
    }
    
    if (rows.length === 0 || this.selectedRows.length === 0) return 0
    
    // 构建要移除的行的主键 Set
    const toRemoveSet = new Set(
      rows.map(r => this.getPrimaryKeyValue(r)).filter(pk => pk !== undefined)
    )
    
    if (toRemoveSet.size === 0) return 0
    
    // 过滤出保留的行
    const newSelection = this.selectedRows.filter(r => {
      const pk = this.getPrimaryKeyValue(r)
      return pk === undefined || !toRemoveSet.has(pk)
    })
    
    const removedCount = this.selectedRows.length - newSelection.length
    if (removedCount > 0) {
      this.setSelectedRows(newSelection, context)
    }
    
    return removedCount
  }

  /**
   * 根据主键数组添加选中行
   * 
   * @param ids - 主键值数组
   * @param context - 事件上下文（可选，未提供时自动生成）
   * @param options - 可选配置
   * @param options.strict - 严格模式：如果有任何 ID 找不到对应行则报错（默认 false，跳过无效 ID）
   * @returns 实际添加的行数（严格模式下找不到会抛出错误）
   */
  addSelectedRowsById(
    ids: Array<string | number>,
    context?: EventContext,
    options?: { strict?: boolean }
  ): number {
    this.checkDestroyed()
    
    // 防御性检查
    if (!Array.isArray(ids)) {
      this.logger.warn('addSelectedRowsById 收到非数组参数', { ids, tableName: this.tableName, viewId: this.viewId })
      return 0
    }
    
    if (ids.length === 0) return 0
    
    // 构建主键到行的映射
    const idToRow = new Map<string | number, IDataRow>()
    for (const row of this.rows) {
      const pkValue = this.getPrimaryKeyValue(row)
      if (pkValue !== undefined) {
        idToRow.set(pkValue, row)
      }
    }
    
    // 构建现有选中行的主键 Set
    const selectedSet = new Set(
      this.selectedRows.map(r => this.getPrimaryKeyValue(r)).filter(pk => pk !== undefined)
    )
    
    // 查找要添加的行
    const toAdd: IDataRow[] = []
    const notFoundIds: Array<string | number> = []
    const alreadySelectedIds: Array<string | number> = []
    
    for (const id of ids) {
      // 已经选中，跳过
      if (selectedSet.has(id)) {
        alreadySelectedIds.push(id)
        continue
      }
      
      const row = idToRow.get(id)
      if (row) {
        toAdd.push(row)
      } else {
        notFoundIds.push(id)
      }
    }
    
    // 严格模式：有找不到的 ID 则报错
    if (options?.strict && notFoundIds.length > 0) {
      const error = new Error(
        `addSelectedRowsById (strict): 有 ${notFoundIds.length} 个 ID 找不到对应行`
      )
      this.logger.error('addSelectedRowsById: 严格模式下有 ID 找不到', {
        tableName: this.tableName,
        viewId: this.viewId,
        primaryKey: this.primaryKey,
        notFoundIds,
        totalRows: this.rows.length
      })
      throw error
    }
    
    // 非严格模式：记录警告
    if (notFoundIds.length > 0) {
      this.logger.warn('addSelectedRowsById: 部分 ID 找不到对应行', {
        tableName: this.tableName,
        viewId: this.viewId,
        primaryKey: this.primaryKey,
        notFoundIds,
        foundCount: toAdd.length,
        alreadySelected: alreadySelectedIds.length,
        totalRows: this.rows.length
      })
    }
    
    // 添加到选中集
    if (toAdd.length > 0) {
      return this.addSelectedRows(toAdd, context)
    }
    
    return 0
  }

  /**
   * 根据主键数组移除选中行
   * 
   * @param ids - 主键值数组
   * @param context - 事件上下文（可选，未提供时自动生成）
   * @returns 实际移除的行数
   */
  removeSelectedRowsById(
    ids: Array<string | number>,
    context?: EventContext
  ): number {
    this.checkDestroyed()
    
    // 防御性检查
    if (!Array.isArray(ids)) {
      this.logger.warn('removeSelectedRowsById 收到非数组参数', { ids, tableName: this.tableName, viewId: this.viewId })
      return 0
    }
    
    if (ids.length === 0 || this.selectedRows.length === 0) return 0
    
    // 构建要移除的主键 Set
    const toRemoveSet = new Set(ids)
    
    // 过滤出保留的行
    const newSelection = this.selectedRows.filter(r => {
      const pk = this.getPrimaryKeyValue(r)
      return pk === undefined || !toRemoveSet.has(pk)
    })
    
    const removedCount = this.selectedRows.length - newSelection.length
    if (removedCount > 0) {
      this.setSelectedRows(newSelection, context)
    }
    
    return removedCount
  }

  // ─────────────────────────────────────────────
  // 状态重置
  // ─────────────────────────────────────────────

  /** 清空所有状态并发射 cleared 事件（通知 UI 和子视图） */
  clearAll(): void {
    const prevCurrentRow = this.currentRow
    const prevHadSelected = this.selectedRows.length > 0
    const had = this.rows.length > 0 || prevCurrentRow !== null || prevHadSelected
    this.resetState()
    if (had) {
      const ctx = this._mkCtx()
      // 通知 bus：el-table 需要通过 bus 事件（而非 stateChanged）清除 currentRow/selectedRows 高亮
      if (prevCurrentRow !== null) {
        bus.emit('view:currentRow', { tableName: this.tableName, viewId: this.viewId, row: null, context: ctx })
      }
      if (prevHadSelected) {
        bus.emit('view:selectedRows', { tableName: this.tableName, viewId: this.viewId, rows: [], context: ctx })
      }
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
    this.rowIndexMap = undefined   // 行集合已清空，索引缓存失效
    this.requestState = RequestState.Idle
    this.loadingError = null
  }

  /** 清理已不在 rows 中的选中状态，返回是否发生了清理 */
  cleanupInvalidSelections(): boolean {
    let cleaned = false
    // O(n) 构建主键查找 Map，避免内部每次 isSamePrimaryKey 再做 O(n) 扫描
    const rowPkSet = new Set(
      this.rows.map(r => this.getPrimaryKeyValue(r)).filter(pk => pk !== undefined)
    )
    const currentRow = this.currentRow
    if (currentRow) {
      const pk = this.getPrimaryKeyValue(currentRow)
      if (pk === undefined || !rowPkSet.has(pk)) {
        this.currentRow = null
        this.currentRowIndex = null
        cleaned = true
      }
    }
    if (this.selectedRows.length > 0) {
      const valid = this.selectedRows.filter(sr => {
        const pk = this.getPrimaryKeyValue(sr)
        return pk !== undefined && rowPkSet.has(pk)
      })
      if (valid.length !== this.selectedRows.length) {
        this.selectedRows.splice(0, this.selectedRows.length, ...valid)
        this.rowIndexMap ??= new Map(this.rows.map((r, i) => [r, i]))
        this.selectedRowIndices = valid
          .map(r => this.rowIndexMap?.get(r) ?? -1)
          .filter(i => i !== -1)
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
   * 统一发射 stateChanged 事件
   *
   * - rows：防抖 16ms（合并批量更新，减少重绘）；只有同类事件才取消前一次防抖，
   *   立即事件（currentRow 等）不会意外取消正在等待的 rows 通知。
   * - 其余事件：立即触发（cleared / requestState / mutating / currentRow / selectedRows）。
   * - extra 先展开，再用具名字段覆盖，防止 extra.context 等字段覆盖计算值。
   */
  private emitStateChanged(changeType: ViewStateEvent['changeType'], extra?: Partial<ViewStateEvent>): void {
    const context = extra?.context ?? this._mkCtx()
    // extra spreads first; explicit fields always win
    const event: ViewStateEvent = { ...extra, tableName: this.tableName, viewId: this.viewId, changeType, context }

    if (changeType === 'rows') {
      // Only rows uses debounce; cancel only a previous rows debounce (not immediate events)
      if (this.stateChangedDebouncer) {
        clearTimeout(this.stateChangedDebouncer)
      }
      this.stateChangedDebouncer = setTimeout(() => {
        this.events.emit('stateChanged', event)
        this.stateChangedDebouncer = undefined
      }, 16)
    } else {
      this.events.emit('stateChanged', event)
    }
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
    // 只在非默认值时序列化（减少 JSON 体积）
    if (this.autoCurrentFirst !== true) result.autoCurrentFirst = this.autoCurrentFirst
    if (this.autoSelectFirst !== true) result.autoSelectFirst = this.autoSelectFirst
    return result
  }

  static fromData(data: IViewMetadata, tableName: string, viewId: string): DataView {
    const v = new DataView(tableName, viewId)
    if (data.filterExpression !== undefined) v.filterExpression = data.filterExpression
    if (data.sortExpression !== undefined) v.sortExpression = data.sortExpression
    // autoCurrentFirst 和 autoSelectFirst 默认为 true，只在显式指定时覆盖
    if (data.autoCurrentFirst !== undefined) v.autoCurrentFirst = data.autoCurrentFirst
    if (data.autoSelectFirst !== undefined) v.autoSelectFirst = data.autoSelectFirst
    v.page = data.page ?? 1
    v.pageSize = data.pageSize ?? 20
    return v
  }
}
