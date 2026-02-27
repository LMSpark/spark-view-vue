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
  FlatTreeNode, TreePath, NestedTreeSearchResult,
  TreeConfig,
} from './types'
import { RequestState } from './types'
import { createEventContext } from './core/event-id'
import { TreeManager } from './tree-manager'
import type { DataTable } from './data-table'
import type { CrudService } from './crud-service'
import type { DataValidator } from './validation'
import { Logger, createEventEmitter } from '@spark-view/spark-utils'
import type { IEventEmitter } from '@spark-view/spark-utils'
import { isSameRow, getParentRows } from './core/utils'
import { CrudDelegate } from './strategies/crud-delegate'
import { CascadeDelegate } from './strategies/cascade-delegate'
import { SelectionDelegate } from './strategies/selection-delegate'
import { LocalMutationDelegate } from './strategies/local-mutation-delegate'
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
  /** 树结构字段配置（idField/parentIdField/textField/depthLimit/lazy/treeMode） */
  treeConfig?: TreeConfig | undefined

  /** 树视图模式，代理到 treeConfig.treeMode（默认 'flat'） */
  get treeMode(): 'flat' | 'nested' { return this.treeConfig?.treeMode ?? 'flat' }
  set treeMode(v: 'flat' | 'nested') { (this.treeConfig ??= {}).treeMode = v }

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
  /** 行索引缓存（用于加速 setSelectedRows，O(n) 而非 O(n²)）——由 SelectionDelegate 管理，内部状态勿直接操作 */
  rowIndexMap?: Map<IDataRow, number> | undefined
  /** stateChanged 事件防抖定时器 */
  private stateChangedDebouncer?: ReturnType<typeof setTimeout> | undefined

  // ── 委托 ─────────────────────────────────────

  /** CRUD 操作委托（懒初始化） */
  private _crudDelegate?: CrudDelegate | undefined
  /** 级联订阅委托（懒初始化） */
  private _cascadeDelegate?: CascadeDelegate | undefined
  /** 选中状态委托（懒初始化） */
  private _selectionDelegate?: SelectionDelegate | undefined
  /** 本地内存变更委托（懒初始化） */
  private _localMutationDelegate?: LocalMutationDelegate | undefined

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

  /** 获取选中状态委托（懒初始化） */
  private get selectionDelegate(): SelectionDelegate {
    this._selectionDelegate ??= new SelectionDelegate(
      this,
      (changeType, extra) => this.emitStateChanged(changeType, extra),
      () => this._mkCtx(),
    )
    return this._selectionDelegate
  }

  /** 获取本地变更委托（懒初始化） */
  private get localMutationDelegate(): LocalMutationDelegate {
    this._localMutationDelegate ??= new LocalMutationDelegate(
      this,
      (changeType, extra) => this.emitStateChanged(changeType, extra),
      () => this._mkCtx(),
    )
    return this._localMutationDelegate
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

    // 合并两轮循环：检查父依赖就绪度的同时缓存视图和行数据，避免 getView/getParentRows 二次调用
    const resolvedParents: Array<{ rel: (typeof parents)[number]; pView: DataView; rows: IDataRow[] }> = []
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
      resolvedParents.push({ rel, pView, rows: parentRows })
    }

    // 按各关系的 filterExpression 组装查询参数（复用 resolvedParents，无需二次 getView/getParentRows）
    const params: QueryParams = {}
    for (const { rel, rows: parentRows } of resolvedParents) {
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
        this.selectionDelegate.applyAutoFirst()
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
    this.localMutationDelegate.updateFromServer(data)
  }

  /** 本地追加一行，发射 stateChanged('rows') */
  appendRow(row: IDataRow): void {
    this.localMutationDelegate.appendRow(row)
  }

  /** 本地按主键部分更新一行，发射 stateChanged('rows')；返回是否成功（行不存在时 false） */
  updateRowById(id: string | number, data: Partial<IDataRow>): boolean {
    return this.localMutationDelegate.updateRowById(id, data)
  }

  /** 本地按主键删除一行，清理选中引用，发射 stateChanged('rows')；返回是否成功（行不存在时 false） */
  deleteRowById(id: string | number): boolean {
    return this.localMutationDelegate.deleteRowById(id)
  }

  /** 本地整批替换所有行（响应式安全），清理无效选中引用，发射 stateChanged('rows') */
  replaceRows(rows: IDataRow[]): void {
    this.localMutationDelegate.replaceRows(rows)
  }

  // ─────────────────────────────────────────────
  // 选中状态（委托给 SelectionDelegate）
  // ─────────────────────────────────────────────

  setCurrentRow(row: IDataRow | null, context?: EventContext): void {
    this.selectionDelegate.setCurrentRow(row, context)
  }

  setSelectedRows(rows: IDataRow[], context?: EventContext): void {
    this.selectionDelegate.setSelectedRows(rows, context)
  }

  setCurrentRowById(id: string | number, context?: EventContext): boolean {
    return this.selectionDelegate.setCurrentRowById(id, context)
  }

  setSelectedRowsById(
    ids: Array<string | number>,
    context?: EventContext,
    options?: { strict?: boolean }
  ): number {
    return this.selectionDelegate.setSelectedRowsById(ids, context, options)
  }

  clearSelectedRows(context?: EventContext): void {
    this.selectionDelegate.clearSelectedRows(context)
  }

  addSelectedRows(rows: IDataRow[], context?: EventContext): number {
    return this.selectionDelegate.addSelectedRows(rows, context)
  }

  removeSelectedRows(rows: IDataRow[], context?: EventContext): number {
    return this.selectionDelegate.removeSelectedRows(rows, context)
  }

  addSelectedRowsById(
    ids: Array<string | number>,
    context?: EventContext,
    options?: { strict?: boolean }
  ): number {
    return this.selectionDelegate.addSelectedRowsById(ids, context, options)
  }

  removeSelectedRowsById(ids: Array<string | number>, context?: EventContext): number {
    return this.selectionDelegate.removeSelectedRowsById(ids, context)
  }

  // ─────────────────────────────────────────────
  // 状态重置
  // ─────────────────────────────────────────────

  /** 清空所有状态并发射 cleared 事件（通知 UI 和子视图） */
  clearAll(): void {
    const had = this.rows.length > 0 || this.currentRow !== null || this.selectedRows.length > 0
    this.resetState()
    if (had) {
      // stateChanged('cleared') 通知 DataSet.onAnyViewChange 订阅者清除 UI 高亮
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

  /** 清理已不在 rows 中的选中状态，返回是否发生了清理（委托给 SelectionDelegate） */
  cleanupInvalidSelections(): boolean {
    return this.selectionDelegate.cleanupInvalidSelections()
  }

  // ─────────────────────────────────────────────
  // 树操作（委托给 TreeManager）
  // ─────────────────────────────────────────────

  /** 懒初始化 TreeManager（传入 treeConfig 字段映射 + DataTable.treeApi 接口族） */
  private _ensureTreeManager(): TreeManager {
    if (!this.treeManager) {
      const cfg = this.treeConfig ?? {}
      this.treeManager = new TreeManager(cfg, this.dataTable?.api)
    }
    return this.treeManager
  }

  /** 拉取直接子节点并写入缓存（对应 /tree/children） */
  loadTreeChildren(parentId: string | number | null, limit?: number): Promise<FlatTreeNode[]> {
    return this._ensureTreeManager().fetchChildren(parentId, limit)
  }

  /** 获取节点祖先链 ID（对应 /tree/path） */
  loadTreePath(id: string | number): Promise<TreePath> {
    return this._ensureTreeManager().fetchPath(id)
  }

  /** 展开到目标节点，差量补齐缓存（对应 /tree/path + /tree/subtree） */
  expandTreeToNode(targetId: string | number): Promise<void> {
    return this._ensureTreeManager().expandToNode(targetId)
  }

  /** 嵌套模式远端搜索（对应 /tree/nested/search） */
  searchTreeNested(keyword: string, limit?: number): Promise<NestedTreeSearchResult[]> {
    return this._ensureTreeManager().fetchNestedSearch(keyword, limit)
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
    
    // 6. 清除 TreeManager 引用（_treeHttp 随 DataView GC 自动释放，无需显式清除）
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
    if (this.treeConfig !== undefined) result.treeConfig = this.treeConfig
    return result
  }

  static fromData(data: IViewMetadata, tableName: string, viewId: string): DataView {
    const v = new DataView(tableName, viewId)
    if (data.rows !== undefined) v.rows = [...data.rows]
    if (data.filterExpression !== undefined) v.filterExpression = data.filterExpression
    if (data.sortExpression !== undefined) v.sortExpression = data.sortExpression
    // autoCurrentFirst 和 autoSelectFirst 默认为 true，只在显式指定时覆盖
    if (data.autoCurrentFirst !== undefined) v.autoCurrentFirst = data.autoCurrentFirst
    if (data.autoSelectFirst !== undefined) v.autoSelectFirst = data.autoSelectFirst
    if (data.treeConfig !== undefined) v.treeConfig = data.treeConfig
    v.page = data.page ?? 1
    v.pageSize = data.pageSize ?? 20
    return v
  }
}
