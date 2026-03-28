/**
 * DataView — 数据视图，SPARK 数据层的统一交互枢纽。
 * 引用链：DataView → DataTable → DataSet。
 * 级联加载：子订阅父，父不知子。
 * 请求编排：requestData(上行) / refresh(下行) / requestState(唯一状态源)。
 * 委托分工：CrudDelegate / CascadeDelegate / SelectionDelegate / etc.
 */

import type {
  IDataRow, IViewMetadata, FilterExpression, SortExpression,
  QueryParams, DataColumn, DataRelation,
  CrudResult, CrudOperationConfig,
  IDataSource,
  FlatTreeNode, TreePath, NestedTreeSearchResult, NestedTreeNode,
  TreeConfig, AggregateColumnConfig, CrudApi,
  CommitMode,
} from './types'
import { RequestState } from './types'
import { TreeManager } from './tree-manager'
import type { DataTable } from './data-table'
import type { DataSet } from './dataset'
import type { CrudService } from './crud-service'
import type { DataValidator } from './validation'
import { Logger, createEventEmitter, toErrorMessage, toError } from '@spark-view/spark-utils'
import type { IEventEmitter } from '@spark-view/spark-utils'
import { getParentRows, assertNoSeparator } from './core/utils'
import { CrudDelegate } from './strategies/crud-delegate'
import { CascadeDelegate } from './strategies/cascade-delegate'
import { SelectionDelegate } from './strategies/selection-delegate'
import { LocalMutationDelegate } from './strategies/local-mutation-delegate'
import type { CrudLifecycleEvent } from './strategies/types'

import { PrimaryKeyDelegate } from './strategies/primary-key-delegate'
import { ComputedColumnDelegate } from './strategies/computed-column-delegate'
import type { ComputedColumnContext } from './strategies/computed-column-delegate'
import { DirtyTrackingDelegate } from './strategies/dirty-tracking-delegate'
import { AggregateDelegate } from './strategies/aggregate-delegate'
import type { RowDiff, SaveChangesData } from './strategies/dirty-tracking-delegate'


// ─────────────────────────────────────────────
// 事件类型映射
// ─────────────────────────────────────────────

/** DataView 事件映射 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface DataViewEventMap extends Record<string, any[]> {
  /** 当前行变化 */
  currentRowChanged: [currentRow: IDataRow | null, originatorId?: string]
  /** 选中行变化 */
  selectedRowsChanged: [selectedRows: IDataRow[], originatorId?: string]
  /** 行数据批量变化（防抖 16ms） */
  rowsChanged: []
  /** 数据已清空 */
  cleared: []
  /** 请求状态变化（Idle→Loading→Loaded/Failed） */
  requestStateChanged: [requestState: RequestState]
  /** CRUD 变更状态变化 */
  mutatingChanged: [mutating: boolean]
  /** summaryRow 已重算 */
  summaryChanged: []
  /** selectionSummaryRow 已单独重算（仅选中行变更时触发，数据变更走 summaryChanged） */
  selectionSummaryChanged: []
  /** CRUD 提交前事件——业务脚本可调用 event.cancel() 取消操作 */
  'crud:before': [CrudLifecycleEvent]
  /** CRUD 提交后事件——业务脚本可根据 result 执行联动 */
  'crud:after': [CrudLifecycleEvent]
}

/** rowsChanged 事件防抖延迟（毫秒，约 1 帧） */
const ROWS_CHANGED_DEBOUNCE_MS = 16

// ─────────────────────────────────────────────
// DataView 类
// ─────────────────────────────────────────────

export class DataView implements IDataSource {

  // ─────────────────────────────────────────────
  // DataTable 引用（运行时注入，由 DataTable 在 attach 时赋值）
  // ─────────────────────────────────────────────

  /** 内部存储的 DataTable 引用（运行时由 DataTable.attach 注入） */
  private _dataTable: DataTable | null = null

  /** 列名→列定义缓存 */
  private _columnMap?: Map<string, DataColumn>

  /** 所属 DataTable（赋值时自动重编译计算列）。返回 null 而非抛出（Vue reactive proxy 安全） */
  get dataTable(): DataTable | null {
    return this._dataTable
  }
  set dataTable(table: DataTable) {
    this._dataTable = table
    this._columnMap = new Map(table.columns.map(c => [c.name, c]))
    // 统一注册 _pk 计算列（单列 / 多列 / 默认 'id' 均覆盖）
    this._primaryKeyDelegate.ensurePkColumn()
    // 注入 _pk 列元数据（table.columns + _columnMap）
    this._ensurePkColumnMeta(table)
    if (this.rows.length > 0) this._computedDelegate.apply(this.rows)
    this._computedDelegate.invalidateCache()
    this._computedDelegate.syncFromConfig()
  }

  tableName: string
  viewId: string

  rows: IDataRow[] = []

  // ─────────────────────────────────────────────
  // 主键（全部委托给 _primaryKeyDelegate）
  // ─────────────────────────────────────────────

  /** 主键字段名 getter/setter（委托给 _primaryKeyDelegate） */
  get primaryKey(): string { return this._primaryKeyDelegate.primaryKey }
  set primaryKey(value: string) {
    this._primaryKeyDelegate.primaryKey = value
    // 重新注册 _pk 计算列（基于新的覆盖字段）
    this._primaryKeyDelegate.ensurePkColumn()
    if (this._dataTable) this._ensurePkColumnMeta(this._dataTable)
    if (this.rows.length > 0) this._computedDelegate.apply(this.rows)
  }

  /** 清除显式覆盖，恢复从 DataTable 列定义自动推导主键 */
  resetPrimaryKey(): void {
    this._primaryKeyDelegate.resetPrimaryKey()
    // 重新注册 _pk 计算列（基于列定义推导）
    this._primaryKeyDelegate.ensurePkColumn()
    if (this._dataTable) this._ensurePkColumnMeta(this._dataTable)
    if (this.rows.length > 0) this._computedDelegate.apply(this.rows)
  }

  // ─────────────────────────────────────────────
  // 选中状态（主键存储，getter 按需解析）
  // ─────────────────────────────────────────────

  /** 当前行主键值（null 表示未选中）。通过 currentRow getter 取对应行对象 */
  _currentRowId: string | number | null = null
  /** 多选行主键值列表。通过 selectedRows getter 取对应行对象数组 */
  _selectedRowIds: Array<string | number> = []

  // ─────────────────────────────────────────────
  // 选中值序列化配置（单选 / 多选通用）
  // ─────────────────────────────────────────────

  /** 值字段名（用于 value getter/setter 序列化），未指定时回退到主键字段 */
  valueField?: string | string[]
  /** 标签显示字段名（用于 labels/label getter），未指定时回退到主键值字符串 */
  labelField?: string
  /** 值序列化分隔符（默认 ','）。非空=多选，空字符串=单选 */
  selectionDelimiter = ','

  /** 是否为多选模式（selectionDelimiter 非空时为多选） */
  get isMultiSelect(): boolean { return this.selectionDelimiter !== '' }

  /** 当前行（getter：按主键从整棵 rows 树查找，带缓存；rows 刷新后自动指向新对象） */
  get currentRow(): IDataRow | null {
    if (this._currentRowId === null) return null
    const c = this._crCache
    if (c.id === this._currentRowId && c.ver === this._rowsVersion) return c.row
    const row = this.getRowById(this._currentRowId)
    this._crCache = { id: this._currentRowId, ver: this._rowsVersion, row }
    return row
  }

  /** 多选行数组（getter：按主键从整棵 rows 树查找，带缓存；rows 刷新后自动指向新对象） */
  get selectedRows(): IDataRow[] {
    if (this._selectedRowIds.length === 0) return []
    const c = this._srCache
    if (c.selVer === this._selectionIdsVersion && c.rowsVer === this._rowsVersion) return c.rows
    const rowById = this.getRowByIdMap()
    const rows = this._selectedRowIds
      .map(id => rowById.get(id) ?? null)
      .filter((row): row is IDataRow => row !== null)
    this._srCache = { selVer: this._selectionIdsVersion, rowsVer: this._rowsVersion, rows }
    return rows
  }

  // ─────────────────────────────────────────────
  // 值序列化层（委托给 SelectionDelegate）
  // ─────────────────────────────────────────────

  /** 选中行的序列化字符串（供 v-model / API 传值） */
  get value(): string { return this.selectionDelegate.value }
  set value(v: string | null | undefined) { this.selectionDelegate.value = v }

  /** 选中行的显示标签数组（供渲染 tag 使用） */
  get labels(): string[] { return this.selectionDelegate.labels }

  /** 当前行的显示标签，无当前行时返回 null */
  get label(): string | null { return this.selectionDelegate.label }

  // ─────────────────────────────────────────────
  // 选中状态操作（委托给 SelectionDelegate）
  // ─────────────────────────────────────────────

  /** 设置当前行（自动提取主键存储，null 清除） */
  setCurrentRow(row: IDataRow | null, originatorId?: string): void {
    this.selectionDelegate.setCurrentRow(row, originatorId)
  }

  /** 通过主键设置当前行（行不存在时返回 false） */
  setCurrentRowById(id: string | number | null, originatorId?: string): boolean {
    return this.selectionDelegate.setCurrentRowById(id, originatorId)
  }

  /** 设置多选行（覆盖式） */
  setSelectedRows(rows: IDataRow[], originatorId?: string): void {
    this.selectionDelegate.setSelectedRows(rows, originatorId)
  }

  /** 追加多选行（返回实际新增数量） */
  addSelectedRows(rows: IDataRow[]): number {
    return this.selectionDelegate.addSelectedRows(rows)
  }

  /** 移除多选行（返回实际移除数量） */
  removeSelectedRows(rows: IDataRow[]): number {
    return this.selectionDelegate.removeSelectedRows(rows)
  }

  /** 通过主键批量移除多选行（返回实际移除数量） */
  removeSelectedRowsById(ids: Array<string | number>): number {
    return this.selectionDelegate.removeSelectedRowsById(ids)
  }

  /** 清空多选行 */
  clearSelectedRows(): void {
    this.selectionDelegate.clearSelectedRows()
  }

  // ─────────────────────────────────────────────
  // 分页 & 加载状态
  // ─────────────────────────────────────────────

  total = 0
  page = 1
  pageSize = 20

  loadingError: Error | null = null
  /** 请求状态机，见 {@link RequestState}。唯一状态源，勿另设布尔标志。 */
  requestState: RequestState = RequestState.Idle
  /** 增删改批网络请求进行中（与 requestState 独立，可同时为 true） */
  mutating = false
  /** 最近一次增删改批操作的错误；成功或未发起时为 null */
  mutatingError: Error | null = null

  // ─────────────────────────────────────────────
  // 视图配置
  // ─────────────────────────────────────────────

  filterExpression?: FilterExpression
  sortExpression?: SortExpression
  /** 请求成功后是否自动 currentRow = rows[0]（默认 true） */
  autoCurrentFirst = true
  /** 请求成功后是否自动 selectedRows = [rows[0]]（默认 true） */
  autoSelectFirst = true
  /** 树结构字段配置 */
  treeConfig?: TreeConfig | undefined

  /** DataSet 初始化后是否自动加载数据（默认 false） */
  autoLoad = false

  /** 设置分页/排序/过滤后是否自动 refresh()（默认 false） */
  autoRefresh = false

  /**
   * 增删改提交模式（默认 `'immediate'`）。
   *
   * - `'immediate'`：每次 addRow/editRowById/removeRow 立即调用网络 CRUD（如已配置 API）
   * - `'staged'`：仅修改内存并标脏，调用 saveChanges() 批量提交
   */
  commitMode: CommitMode = 'immediate'

  /** 视图级聚合配置——行变更后自动重算 summaryRow / selectionSummaryRow。仅由 applyViewConfig() 初始化 */
  readonly aggregates: Record<string, AggregateColumnConfig> = {}

  /** 树视图模式，代理到 treeConfig.treeMode（默认 'flat'） */
  get treeMode(): 'flat' | 'nested' { return this.treeConfig?.treeMode ?? 'flat' }
  set treeMode(v: 'flat' | 'nested') { (this.treeConfig ??= {}).treeMode = v }

  // ─────────────────────────────────────────────
  // 计算列
  // ─────────────────────────────────────────────

  /** 设置计算列共享上下文（表达式中通过 ctx 引用），重新编译并对现有 rows 求值 */
  setComputedContext(ctx: ComputedColumnContext): void {
    this._computedDelegate.setContext(ctx)
    this._computedDelegate.apply(this.rows)
    this.aggregateDelegate.recompute(this.rows, this.selectedRows)
  }

  /** 手动触发全量计算列重新求值 + 聚合重算。常规行操作已自动触发，仅用于特殊场景 */
  recomputeColumns(): void {
    this._computedDelegate.apply(this.rows)
    this.aggregateDelegate.recompute(this.rows, this.selectedRows)
  }

  /** @internal 已注册的计算列名集合（CrudDelegate 用于提交前剥离） */
  get computedColumnNames(): ReadonlySet<string> {
    return this._computedDelegate.names
  }

  /** @internal 从数据对象中移除计算列字段，返回浅拷贝；无计算列时返回原对象。 */
  stripComputedColumns(data: Partial<IDataRow>): Partial<IDataRow> {
    return this._computedDelegate.strip(data)
  }

  private getCrudApiConfig(): CrudApi | undefined {
    return this._dataTable?.api
  }

  private shouldDirectCommitCrud(operation: 'create' | 'update' | 'delete'): boolean {
    if (this.commitMode === 'staged') return false
    const api = this.getCrudApiConfig()
    if (!api) return false
    return api[operation] !== undefined
  }

  /** @internal DataSet 关系规范化完成后由 DataTable 调用——重编译计算列（含聚合 resolver）并重算 */
  onDataSetRelationsReady(): void {
    const hasComputedCols = this._computedDelegate.names.size > 0
    const hasAgg = Object.keys(this.aggregates).length > 0
    if (hasComputedCols) {
      // 失效缓存 → 重编译（含完整 DataSet 聚合 resolver）
      this._computedDelegate.invalidateCache()
      this._computedDelegate.syncFromConfig()
    }
    if (hasComputedCols || hasAgg) {
      this.recomputeColumns()
    }
  }

  /** 对行集合执行计算列求值（就地写入）——供 DataView 内部调用。 */
  private _applyComputedColumns(rows: IDataRow[]): void {
    this._computedDelegate.apply(rows)
  }

  // ─────────────────────────────────────────────
  // 表元数据暴露（IDataSource.columns 实现）
  // ─────────────────────────────────────────────

  /**
   * 列定义数组（只读，来自 DataTable.columns）。
   *
   * UI 组件通过此属性获取列名、标题、类型、可见性、可编辑性等元数据，
   * 无需直接访问 DataTable。
   *
   * @returns DataTable 的列定义数组；DataTable 未关联时返回空数组
   */
  get columns(): readonly DataColumn[] {
    return this._dataTable?.columns ?? []
  }

  /**
   * 按名称获取单个列定义
   *
   * @param name 列名（精确匹配）
   * @returns 对应的列定义，不存在时返回 undefined
   *
   * @example
   * ```ts
   * const col = view.getColumn('price')
   * if (col) {
   *   console.log(col.label)   // '单价'
   *   console.log(col.type)    // 'number'
   * }
   * ```
   */
  getColumn(name: string): DataColumn | undefined {
    return this._columnMap?.get(name)
  }

  /** @internal 返回 DataTable 列定义（已弃用，请使用 `columns` getter） */
  getColumns() { return this._dataTable?.columns }

  /** @internal 返回 DataSet 实例 */
  getDataSet() { return this._dataTable?.dataSet }

  /**
   * 确保 `_pk` 列元数据存在于 `table.columns` 和 `_columnMap` 中。
   *
   * - 已存在时替换（PK 配置可能变化导致 type 不同）
   * - `table.columns` 保证运行时元数据完整；`toData()` 通过 `isComputed` 过滤排除
   */
  private _ensurePkColumnMeta(table: DataTable): void {
    const meta = this._primaryKeyDelegate.getPkColumnMeta()
    const idx = table.columns.findIndex(c => c.name === '_pk')
    if (idx >= 0) {
      table.columns = table.columns.map((c, i) => i === idx ? meta : c)
    } else {
      table.columns = [...table.columns, meta]
    }
    this._columnMap?.set('_pk', meta)
  }

  // ─────────────────────────────────────────────
  // 视图聚合（summaryRow / selectionSummaryRow）
  // ─────────────────────────────────────────────

  /** 视图聚合汇总行——根据 aggregates 配置自动计算，行变更后自动重算 */
  get summaryRow(): Readonly<IDataRow> {
    return this._aggregateDelegate?.summaryRow ?? {}
  }

  /** 选中行聚合汇总行——与 summaryRow 相同逻辑，仅对 selectedRows 执行 */
  get selectionSummaryRow(): Readonly<IDataRow> {
    return this._aggregateDelegate?.selectionSummaryRow ?? {}
  }

  treeManager?: TreeManager | undefined

  // ─────────────────────────────────────────────
  // 私有状态
  // ─────────────────────────────────────────────

  /** 行数据版本号——每次 postMutation 后自增，用于 currentRow / selectedRows 缓存失效 */
  private _rowsVersion = 0
  /** 选中 ID 版本号——每次 emitSelectedRowsChanged 后自增 */
  private _selectionIdsVersion = 0
  /** currentRow getter 缓存 */
  private _crCache: { id: string | number | null; ver: number; row: IDataRow | null } = { id: null, ver: -1, row: null }
  /** selectedRows getter 缓存 */
  private _srCache: { selVer: number; rowsVer: number; rows: IDataRow[] } = { selVer: -1, rowsVer: -1, rows: [] }
  /** 整棵 rows 树的 ID → row 缓存（含 nested children） */
  private _rowByIdCache: { ver: number; rows: Map<string | number, IDataRow> } = { ver: -1, rows: new Map() }

  /** 当前 loadFromServer 请求 ID（用于防止竞态） */
  private currentLoadRequestId = 0
  /** 并发 CRUD 请求计数器（支持多操作同时在途） */
  private _mutatingCount = 0
  /** 销毁状态标记 */
  private _isDestroyed = false
  /** requestData() 进行中的 Promise（用于并发调用复用，避免丢弃后续请求） */
  private _pendingRequestData: Promise<void> | null = null
  /** 行索引缓存（用于加速 updateRowById 行对象替换）——由 LocalMutationDelegate 管理，内部状态勿直接操作 */
  rowIndexMap?: Map<IDataRow, number> | undefined
  /** rowsChanged 事件防抖定时器 */
  private stateChangedDebouncer?: ReturnType<typeof setTimeout> | undefined

  /** 深度遍历整棵 rows 树（含 nested children） */
  private visitRowsDeep(visitor: (row: IDataRow) => void): void {
    const stack = [...this.rows]
    while (stack.length > 0) {
      const row = stack.shift()
      if (!row) continue
      visitor(row)
      const children = (row as Record<string, unknown>)['children']
      if (Array.isArray(children) && children.length > 0) {
        stack.unshift(...children.filter((child): child is IDataRow => typeof child === 'object' && child !== null))
      }
    }
  }

  /** 获取整棵 rows 树的 ID → row 映射（rowsVersion 缓存） */
  private getRowByIdMap(): Map<string | number, IDataRow> {
    if (this._rowByIdCache.ver === this._rowsVersion) return this._rowByIdCache.rows
    const rows = new Map<string | number, IDataRow>()
    this.visitRowsDeep(row => {
      const pk = this.getPkKey(row)
      if (pk !== undefined) rows.set(pk, row)
    })
    this._rowByIdCache = { ver: this._rowsVersion, rows }
    return rows
  }

  /** 按 ID 从整棵 rows 树查找节点 */
  private getRowById(id: string | number): IDataRow | null {
    return this.getRowByIdMap().get(id) ?? null
  }

  private collectTreeSeedRowsFromRows(): FlatTreeNode[] {
    if (!this.treeConfig) return []

    const idField = this.treeConfig.idField ?? 'id'
    const parentIdField = this.treeConfig.parentIdField ?? 'parentId'
    const textField = this.treeConfig.textField ?? 'name'
    const result: FlatTreeNode[] = []

    this.visitRowsDeep(row => {
      const rawId = row[idField]
      if (typeof rawId !== 'string' && typeof rawId !== 'number') return
      const rawParentId = row[parentIdField]
      const textValue = row[textField]
      result.push({
        ...row,
        id: rawId,
        parentId: typeof rawParentId === 'string' || typeof rawParentId === 'number'
          ? rawParentId
          : rawParentId === null || rawParentId === undefined
            ? null
            : String(rawParentId),
        name: typeof textValue === 'string'
          ? textValue
          : typeof row['name'] === 'string'
            ? row['name']
            : typeof row['label'] === 'string'
              ? row['label']
              : String(rawId),
      })
    })

    return result
  }

  private syncTreeManagerFromRows(): void {
    if (!this.treeConfig || !this.treeManager) {
      if (!this.treeConfig) return
      if (this.rows.length === 0) return
    }
    const treeManager = this._ensureTreeManager()
    treeManager.clear()
    if (this.rows.length === 0) return
    treeManager.addNodesToCache(this.collectTreeSeedRowsFromRows())
  }

  private syncRowsFromTreeManager(): void {
    if (!this.treeManager) return
    this.replaceRows(this.treeManager.getAllNodes() as IDataRow[])
  }

  // ─────────────────────────────────────────────
  // 委托实例
  // ─────────────────────────────────────────────

  /** 计算列委托（立即初始化，因 dataTable setter 可能在第一次懒访问之前触发） */
  private _computedDelegate: ComputedColumnDelegate = new ComputedColumnDelegate(this)
  /** 主键委托（立即初始化，因 dataTable setter 在首次懒访问前就可能调用 ensureSyntheticPk） */
  private _primaryKeyDelegate: PrimaryKeyDelegate = new PrimaryKeyDelegate(
    () => this._dataTable?.columns ?? [],
    () => this._columnMap,
    () => this.rows,
    (name, fn) => this._computedDelegate.register(name, fn),
  )
  /** CRUD 操作委托（懒初始化） */
  private _crudDelegate?: CrudDelegate | undefined
  /** 级联订阅委托（懒初始化） */
  private _cascadeDelegate?: CascadeDelegate | undefined
  /** 选中状态委托（懒初始化） */
  private _selectionDelegate?: SelectionDelegate | undefined
  /** 本地内存变更委托（懒初始化） */
  private _localMutationDelegate?: LocalMutationDelegate | undefined
  /** 手工编辑追踪委托（懒初始化） */
  private _dirtyTrackingDelegate?: DirtyTrackingDelegate | undefined
  /** 聚合委托（懒初始化） */
  private _aggregateDelegate?: AggregateDelegate | undefined

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
      () => this.events.emit('cleared'),
    )
    return this._cascadeDelegate
  }

  /** 获取选中状态委托（懒初始化） */
  private get selectionDelegate(): SelectionDelegate {
    this._selectionDelegate ??= new SelectionDelegate(
      this,
      (originatorId?) => this.emitCurrentRowChanged(originatorId),
      (originatorId?) => this.emitSelectedRowsChanged(originatorId),
    )
    return this._selectionDelegate
  }

  /** 获取本地变更委托（懒初始化） */
  private get localMutationDelegate(): LocalMutationDelegate {
    this._localMutationDelegate ??= new LocalMutationDelegate(
      this,
      () => this.emitRowsChanged(),
      (affectedRows) => {
        this._rowsVersion++
        if (affectedRows === 'all') {
          this._applyComputedColumns(this.rows)
        } else if (affectedRows !== null) {
          this._applyComputedColumns(affectedRows)
        }
        this.aggregateDelegate.recompute(this.rows, this.selectedRows)
      },
    )
    return this._localMutationDelegate
  }

  /** 获取手工编辑追踪委托（懒初始化） */
  private get dirtyTrackingDelegate(): DirtyTrackingDelegate {
    this._dirtyTrackingDelegate ??= new DirtyTrackingDelegate({
      getColumns: () => this._dataTable?.columns,
      getComputedColumnNames: () => this._computedDelegate.names,
      getPrimaryKeyFields: () => this.effectivePkFields,
    })
    return this._dirtyTrackingDelegate
  }

  /** 获取聚合委托（懒初始化） */
  private get aggregateDelegate(): AggregateDelegate {
    this._aggregateDelegate ??= new AggregateDelegate(
      () => this.aggregates,
      () => this.events.emit('summaryChanged'),
      () => this.events.emit('selectionSummaryChanged'),
    )
    return this._aggregateDelegate
  }

  // ─────────────────────────────────────────────
  // 公共委托访问器
  // ─────────────────────────────────────────────

  /** 选中状态委托 */
  get selection(): SelectionDelegate { return this.selectionDelegate }

  /** 本地内存变更委托 */
  get mutation(): LocalMutationDelegate { return this.localMutationDelegate }

  /** 网络 CRUD 委托 */
  get crud(): CrudDelegate { return this.crudDelegate }

  /** 手工编辑追踪委托 */
  get dirtyTracking(): DirtyTrackingDelegate { return this.dirtyTrackingDelegate }

  /** 事件总线——独立事件模型（currentRowChanged / selectedRowsChanged / rowsChanged / cleared / requestStateChanged / mutatingChanged） */
  readonly events: IEventEmitter<DataViewEventMap> = createEventEmitter()

  protected logger = Logger('DataView')

  constructor(tableName: string, viewId = 'default') {
    assertNoSeparator(tableName, 'tableName')
    assertNoSeparator(viewId, 'viewId')
    this.tableName = tableName
    this.viewId = viewId
  }

  // ─────────────────────────────────────────────
  // 接口实现 getter（ICrudHost / ICascadeHost）
  // ─────────────────────────────────────────────

  /** ICascadeHost：向上访问 DataSet（独立 DataTable 未关联 DataSet 时返回 undefined） */
  get dataSet(): DataSet | undefined {
    this.checkDestroyed()
    return this.checkDataTableAttached().dataSet
  }

  /** ICrudHost: CrudService 实例 */
  get crudService(): CrudService | undefined { this.checkDestroyed(); return this.checkDataTableAttached().crudService }
  /** ICrudHost: CRUD 操作配置 */
  get crudConfig(): CrudOperationConfig | undefined { this.checkDestroyed(); return this.checkDataTableAttached().crudConfig }
  /** ICrudHost: 数据校验器 */
  get validator(): DataValidator | undefined { this.checkDestroyed(); return this.checkDataTableAttached().validator }

  // ─────────────────────────────────────────────
  // 主键（IRowStore 接口 + ISaveChangesHost 接口 + 公共委托访问器）
  // ─────────────────────────────────────────────

  /** 主键委托访问器（setPrimaryKeyGenerator / generatePrimaryKey 等通过 view.pk.xxx 访问） */
  get pk(): PrimaryKeyDelegate { return this._primaryKeyDelegate }

  /** IRowStore: 实际生效的主键字段名列表（不含合成列 `_pk`） */
  get effectivePkFields(): string[] { return this._primaryKeyDelegate.effectivePkFields }

  /** IRowStore: 获取行的主键值（标量） */
  getPkKey(row: IDataRow): string | number | undefined { return this._primaryKeyDelegate.getPkKey(row) }

  /** ISaveChangesHost: 从行数据构建服务端 PK payload */
  buildServerPk(row: IDataRow): Record<string, unknown> { return this._primaryKeyDelegate.buildServerPk(row) }

  // ─────────────────────────────────────────────
  // 请求流
  // ─────────────────────────────────────────────

  // ── 上行：父依赖解析 → 加载自身 ──────────────

  /**
  /** 视图级加载编排器（幂等：requestState≠Idle 时直接返回）。外部应使用 refresh() 或 loadFromServer()。 */
  async requestData(): Promise<void> {
    if (this.requestState !== RequestState.Idle) {
      if (this._pendingRequestData) return this._pendingRequestData
      this.logger.debug(`requestData 跳过（当前状态: ${this.requestState}），请使用 refresh() 强制刷新`)
      return
    }

    const run = async (): Promise<void> => {

    this.requestState = RequestState.Preparing

    // 逐个父视图检查依赖是否满足
    const ds = this.dataSet
    const parents = ds ? ds.getParentRelations(this.tableName, this.viewId) : []

    // 合并两轮循环：检查父依赖就绪度的同时缓存视图和行数据，避免 getView/getParentRows 二次调用
    const resolvedParents: Array<{ rel: (typeof parents)[number]; pView: DataView; rows: readonly IDataRow[] }> = []
    for (const rel of parents) {
      const pView = ds?.getView(rel.parentTable, rel.parentViewId ?? 'default')
      if (!pView) continue

      if (pView.requestState === RequestState.Idle) {
        void pView.requestData()
      }

      const parentRows = getParentRows(pView, rel.dependencyType ?? 'currentRow')
      // Phase 4 S2: Loading 不视为就绪（可能持有上轮旧数据），必须 Loaded 或有实际行数据
      const parentReady = pView.requestState === RequestState.Loaded || pView.rows.length > 0
      if (!parentReady || parentRows.length === 0) {
        this.requestState = RequestState.Failed
        this.events.emit('requestStateChanged', this.requestState)
        return
      }
      resolvedParents.push({ rel, pView, rows: parentRows })
    }

    // 按各关系的 filterExpression 组装查询参数（复用 resolvedParents，无需二次 getView/getParentRows）
    const params: QueryParams = {}
    for (const { rel, pView, rows: parentRows } of resolvedParents) {
      if (!parentRows.length) continue
      const expr = rel.filterExpression
      if (!expr) continue

      let parentKey: string | undefined
      if (typeof rel.parentField === 'string') {
        parentKey = rel.parentField
      } else {
        // 回退到父视图的 primaryKey 配置（Phase 3 S1: 消除硬编码 'id'）
        parentKey = pView.primaryKey
      }

      const values = parentRows.map(r => r[parentKey])

      let childKey: string
      if (typeof rel.childField === 'string') childKey = rel.childField
      else if ('field' in expr) childKey = expr.field
      else childKey = parentKey

      if ('op' in expr && 'field' in expr) {
        params[childKey] = expr.op === 'in' ? values : values[0]
      } else {
        params[childKey] = values[0]
      }
    }

    // 注入视图自身的分页/排序/过滤参数
    params.page = this.page
    params.pageSize = this.pageSize
    if (this.sortExpression !== undefined) params.sort = this._serializeSort(this.sortExpression)
    if (this.filterExpression !== undefined) params.filter = this.filterExpression

    try {
      const result = await this.loadFromServer(params)
      if (!result.success) return
    } catch (error: unknown) {
      // 不再静默吞异常：记录错误、设置失败状态、通知订阅方
      this.logger.error(`requestData 失败 [${this.tableName}@${this.viewId}]: ${toErrorMessage(error)}`)
      this.requestState = RequestState.Failed
      this.loadingError = error instanceof Error ? error : new Error(toErrorMessage(error))
      this.events.emit('requestStateChanged', this.requestState)
      return
    }

    // 子视图级联由 rowsChanged 事件驱动（respondToParentChange），无需主动推
    }

    this._pendingRequestData = run()
    try {
      await this._pendingRequestData
    } finally {
      this._pendingRequestData = null
    }
  }

  /** 从服务器拉取列表（带防重入 + 请求 ID 竞态保护） */
  async loadFromServer(params?: QueryParams): Promise<CrudResult> {
    this.checkDestroyed()
    if (this.requestState === RequestState.Loading) return { success: false, message: 'Already loading' }

    this.requestState = RequestState.Loading
    this.loadingError = null
    
    const requestId = ++this.currentLoadRequestId

    try {
      const loadParams = this.buildTreeModeParams(params)
      const result = await this.crudDelegate.list(loadParams)
      
      if (requestId !== this.currentLoadRequestId) {
        this.logger.debug(`loadFromServer 请求 ${requestId} 被更新的请求 ${this.currentLoadRequestId} 替代，忽略响应`)
        return { success: false, message: 'Request superseded' }
      }
      
      if (result.success && result.data !== undefined) {
        this.updateFromServer(result.data as { rows?: IDataRow[]; total?: number; page?: number; pageSize?: number } | IDataRow[])
        this.selectionDelegate.applyAutoFirst()
        this.requestState = RequestState.Loaded
        this.events.emit('requestStateChanged', this.requestState)   // 通知 Idle→Loading→Loaded 转换（DataSet.on('loadSuccess') 依赖此事件）
        this.emitRowsChanged()
      } else {
        this.requestState = RequestState.Failed
        this.events.emit('requestStateChanged', this.requestState)
      }
      return result
    } catch (error) {
      if (requestId !== this.currentLoadRequestId) {
        this.logger.debug(`loadFromServer 请求 ${requestId} 异常被忽略（已被新请求替代）`)
        return { success: false, message: 'Request superseded' }
      }
      
      this.loadingError = toError(error)
      this.requestState = RequestState.Failed
      this.events.emit('requestStateChanged', this.requestState)
      throw error
    }
  }

  private buildTreeModeParams(params?: QueryParams, treeMode?: 'flat' | 'nested'): QueryParams {
    return {
      ...(params ?? {}),
      treeMode: treeMode ?? this.treeMode,
    }
  }

  async loadTreeNested(rootId?: string | number | null, limit?: number, depthLimit?: number): Promise<CrudResult<NestedTreeNode[]>> {
    this.checkDestroyed()
    if (this.requestState === RequestState.Loading) return { success: false, message: 'Already loading' }

    this.requestState = RequestState.Loading
    this.loadingError = null

    const requestId = ++this.currentLoadRequestId

    try {
      const treeManager: TreeManager = this._ensureTreeManager()
      const rows = await treeManager.fetchNested(rootId, limit, depthLimit, 'nested')

      if (requestId !== this.currentLoadRequestId) {
        this.logger.debug(`loadTreeNested 请求 ${requestId} 被更新的请求 ${this.currentLoadRequestId} 替代，忽略响应`)
        return { success: false, message: 'Request superseded' }
      }

      this.updateFromServer(rows as IDataRow[])
      this.selectionDelegate.applyAutoFirst()
      this.requestState = RequestState.Loaded
      this.events.emit('requestStateChanged', this.requestState)
      this.emitRowsChanged()
      return { success: true, data: rows }
    } catch (error) {
      if (requestId !== this.currentLoadRequestId) {
        this.logger.debug(`loadTreeNested 请求 ${requestId} 异常被忽略（已被新请求替代）`)
        return { success: false, message: 'Request superseded' }
      }

      this.loadingError = toError(error)
      this.requestState = RequestState.Failed
      this.events.emit('requestStateChanged', this.requestState)
      throw error
    }
  }

  /** 强制刷新：先置 Idle 再 requestData()，无论当前状态一律重新拉取。清除 staged 模式的脏追踪状态。 */
  async refresh(): Promise<void> {
    this._dirtyTrackingDelegate?.clearAll()
    this.requestState = RequestState.Idle
    return this.requestData()
  }

  /** 无 API 时的内存级联过滤（从 DataTable.rows 按关系字段过滤写入视图）。 */
  applyInMemoryCascade(rel: DataRelation, parentRows: readonly IDataRow[]): void {
    // 从 DataTable.rows 读取全量静态源数据（可在多次父行切换中反复过滤）
    const srcRows: IDataRow[] = this._dataTable?.rows ?? []
    const childField = typeof rel.childField === 'string' ? rel.childField : undefined
    let filteredRows: IDataRow[]

    if (childField && parentRows.length > 0) {
      const pField = typeof rel.parentField === 'string' ? rel.parentField : 'id'
      const parentValues = new Set<unknown>(parentRows.map((r: IDataRow) => r[pField]))
      filteredRows = srcRows.filter((r: IDataRow) => parentValues.has(r[childField]))
    } else {
      // 无 childField：显示全部源行；无 parentRows 不该走到此处（已在 respondToParentChange 前置守卫）
      filteredRows = srcRows.slice()
    }

    this.updateFromServer(filteredRows)
    this.selectionDelegate.applyAutoFirst()
    // 内存级联不走网络，requestState 直接 Loaded（不发 requestStateChanged 避免副作用）
    this.requestState = RequestState.Loaded
    this.emitRowsChanged()
  }

  // ─────────────────────────────────────────────
  // 本地 CRUD（内存同步，不触发网络请求）
  // ─────────────────────────────────────────────

  /** 将服务端响应同步到本地字段（rows / total / page / pageSize）——splice 保持数组引用稳定 */
  updateFromServer(data: { rows?: IDataRow[]; total?: number; page?: number; pageSize?: number } | IDataRow[]): void {
    this.localMutationDelegate.updateFromServer(data)
    this.syncTreeManagerFromRows()
  }

  /** 本地追加一行，触发计算列求值 + 聚合重算 + rowsChanged */
  appendRow(row: IDataRow): void {
    this.localMutationDelegate.appendRow(row)
    this.syncTreeManagerFromRows()
  }

  /** 本地按主键部分更新一行；返回是否成功（行不存在时 false） */
  updateRowById(id: string | number, data: Partial<IDataRow>): boolean {
    const updated = this.localMutationDelegate.updateRowById(id, data)
    if (updated) this.syncTreeManagerFromRows()
    return updated
  }

  /** 本地按主键删除一行，清理选中引用；返回是否成功（行不存在时 false） */
  deleteRowById(id: string | number): boolean {
    const deleted = this.localMutationDelegate.deleteRowById(id)
    if (deleted) this.syncTreeManagerFromRows()
    return deleted
  }

  /** 本地整批替换所有行，清理无效选中引用，清除 staged 模式的脏追踪状态 */
  replaceRows(rows: IDataRow[]): void {
    this._dirtyTrackingDelegate?.clearAll()
    this.localMutationDelegate.replaceRows(rows)
    this.syncTreeManagerFromRows()
  }

  // ─────────────────────────────────────────────
  // 手工编辑（带脏追踪）
  // ─────────────────────────────────────────────

  /**
   * 本地新增行。commitMode='staged' 时标记为 pending-create（saveChanges 统一提交）；
   * commitMode='immediate' 且已配置 API 时立即调用 crud.createRecord。
   */
  async addRow(data: Partial<IDataRow>): Promise<IDataRow | CrudResult<IDataRow>> {
    this.checkDestroyed()
    const row = this._primaryKeyDelegate.ensurePrimaryKey(data)
    if (this.shouldDirectCommitCrud('create')) {
      return this.crudDelegate.createRecord(row)
    }
    this.appendRow(row)
    const pkKey = this.getPkKey(row)
    if (pkKey !== undefined) {
      this.dirtyTrackingDelegate.trackCreate(pkKey, row)
    }
    return row
  }

  /**
   * 本地删除行。commitMode='staged' 时标记为 pending-delete（saveChanges 统一提交）；
   * commitMode='immediate' 且已配置 API 时立即调用 crud.deleteRecord。
   */
  async removeRow(id: string | number): Promise<boolean | CrudResult<boolean>> {
    this.checkDestroyed()
    if (this.shouldDirectCommitCrud('delete')) {
      return this.crudDelegate.deleteRecord(id)
    }
    const snapshot = this.rows.find(r => this.getPkKey(r) === id)
    if (!snapshot) return false
    const result = this.deleteRowById(id)
    if (result) {
      this.dirtyTrackingDelegate.trackDelete(id, snapshot)
    }
    return result
  }

  /**
   * 手工编辑指定行（标脏）。commitMode='staged' 时仅更新内存并标脏；
   * commitMode='immediate' 且已配置 API 时立即调用 crud.updateRecord。
   * 连续编辑同一行只保留首次编辑前的快照。
   */
  async editRowById(
    id: string | number,
    data: Partial<IDataRow>,
  ): Promise<boolean | CrudResult<IDataRow>> {
    this.checkDestroyed()
    if (this.shouldDirectCommitCrud('update')) {
      return this.crudDelegate.updateRecord(id, data)
    }
    // 先获取编辑前快照（updateRowById 会替换行对象，必须在之前取）
    const original = this.rows.find(r => this.getPkKey(r) === id)
    if (!original) return false

    const result = this.updateRowById(id, data)
    if (result) {
      this.dirtyTrackingDelegate.markDirty(id, original)
    }
    return result
  }

  // ─────────────────────────────────────────────
  // 手工编辑查询（dirtyRows / getDirtyChanges 需要行引用，保留在 DataView）
  // ─────────────────────────────────────────────

  /** 当前所有脏行的行对象数组（按 rows 顺序） */
  get dirtyRows(): IDataRow[] {
    const ids = this.dirtyTrackingDelegate.dirtyRowIds
    if (ids.size === 0) return []
    return this.rows.filter(r => {
      const pk = this._primaryKeyDelegate.getPkKey(r)
      return pk !== undefined && ids.has(pk)
    })
  }

  /** 获取指定行的字段级变更明细（行不脏时返回 {}） */
  getDirtyChanges(id: string | number): RowDiff {
    const current = this.rows.find(r => this._primaryKeyDelegate.getPkKey(r) === id)
    if (!current) return {}
    return this.dirtyTrackingDelegate.getDiff(id, current)
  }

  /** 将待提交变更（新增→更新→删除）逐条保存到服务端。单行失败不中断后续行。 */
  async saveChanges(ids?: Array<string | number>): Promise<CrudResult<SaveChangesData>> {
    this.checkDestroyed()
    return this.dirtyTrackingDelegate.executeChanges(this, this.crudDelegate, ids)
  }


  // ─────────────────────────────────────────────
  // 状态重置
  // ─────────────────────────────────────────────

  /** 清空所有状态并发射 cleared 事件（通知 UI 和子视图） */
  clearAll(): void {
    const had = this.rows.length > 0 || this.currentRow !== null || this.selectedRows.length > 0
    this.resetState()
    if (had) {
      this.events.emit('cleared')
    }
  }

  /**
   * 静默重置行数据和选中状态，并将 requestState 重置为 Idle。
   * 同时清除脏追踪状态（staged 模式下的未提交变更）。
   * 不发事件、不通知订阅者——该工作由调用方负责。
   */
  resetState(): void {
    this.rows = []
    this._currentRowId = null
    this._selectedRowIds = []
    this.rowIndexMap = undefined   // 行集合已清空，索引缓存失效
    this.requestState = RequestState.Idle
    this.loadingError = null
    this._dirtyTrackingDelegate?.clearAll()
  }

  /** 清理已不在 rows 中的选中状态，返回是否发生了清理（委托给 SelectionDelegate） */
  cleanupInvalidSelections(): boolean {
    return this.selectionDelegate.cleanupInvalidSelections()
  }

  // ─────────────────────────────────────────────
  // 树操作（委托给 TreeManager）
  // ─────────────────────────────────────────────

  /** 懒初始化 TreeManager（传入 treeConfig 字段映射 + DataTable 的 api 和 HTTP 客户端） */
  private _ensureTreeManager(): TreeManager {
    if (!this.treeManager) {
      const cfg = this.treeConfig ?? {}
      // S3: 将 CrudService 的 HTTP 客户端传递给 TreeManager，共享拦截器/认证/配置
      const httpClient = this._dataTable?.crudService?.getHttpClient()
      this.treeManager = new TreeManager(cfg, this._dataTable?.api, undefined, httpClient)
    }
    return this.treeManager
  }

  /** 拉取直接子节点并写入缓存（对应 /tree/children） */
  loadTreeChildren(parentId: string | number | null, limit?: number): Promise<FlatTreeNode[]> {
    return this._ensureTreeManager().fetchChildren(parentId, limit).then(rows => {
      this.syncRowsFromTreeManager()
      return rows
    })
  }

  /** 获取节点祖先链 ID（对应 /tree/path） */
  loadTreePath(id: string | number): Promise<TreePath> {
    return this._ensureTreeManager().fetchPath(id)
  }

  /** 展开到目标节点，差量补齐缓存（对应 /tree/path + /tree/subtree） */
  expandTreeToNode(targetId: string | number): Promise<void> {
    return this._ensureTreeManager().expandToNode(targetId).then(() => {
      this.syncRowsFromTreeManager()
    })
  }

  moveTreeNode(nodeId: string | number, newParentId: string | number | null, index?: number): Promise<IDataRow | null> {
    return this._ensureTreeManager().moveNode(nodeId, newParentId, index).then(() => {
      this.syncRowsFromTreeManager()
      return this.getRowById(nodeId)
    })
  }

  /** 嵌套模式远端搜索（对应 /tree/nested/search） */
  searchTreeNested(keyword: string, limit?: number): Promise<NestedTreeSearchResult[]> {
    return this._ensureTreeManager().fetchNestedSearch(keyword, limit)
  }

  // ─────────────────────────────────────────────
  // 事件通知（独立事件模型）
  // ─────────────────────────────────────────────

  /** 发射 currentRowChanged 事件（立即） */
  private emitCurrentRowChanged(originatorId?: string): void {
    this.events.emit('currentRowChanged', this.currentRow, originatorId)
  }

  /** 发射 selectedRowsChanged 事件（立即） */
  private emitSelectedRowsChanged(originatorId?: string): void {
    this._selectionIdsVersion++
    this.aggregateDelegate.recomputeSelection(this.selectedRows)
    this.events.emit('selectedRowsChanged', this.selectedRows, originatorId)
  }

  /** 发射 rowsChanged 事件（防抖 16ms，合并批量更新） */
  private emitRowsChanged(): void {
    if (this.stateChangedDebouncer) {
      clearTimeout(this.stateChangedDebouncer)
    }
    this.stateChangedDebouncer = setTimeout(() => {
      this.events.emit('rowsChanged')
      this.stateChangedDebouncer = undefined
    }, ROWS_CHANGED_DEBOUNCE_MS)
  }

  /** 将 SortExpression 序列化为查询字符串格式（如 `name:asc` 或 `name:asc,age:desc`） */
  private _serializeSort(sort: SortExpression): string {
    return sort.map(f => `${f.field}:${f.direction ?? 'asc'}`).join(',')
  }

  /** 设置当前页（autoRefresh=true 时自动刷新） */
  async setPage(page: number): Promise<void> {
    this.page = page
    if (this.autoRefresh) await this.refresh()
  }

  /** 设置每页条数并重置页码为 1（autoRefresh=true 时自动刷新） */
  async setPageSize(pageSize: number): Promise<void> {
    this.pageSize = pageSize
    this.page = 1
    if (this.autoRefresh) await this.refresh()
  }

  /** 设置排序表达式（autoRefresh=true 时自动刷新） */
  async setSort(sort: SortExpression | undefined): Promise<void> {
    if (sort === undefined) {
      delete this.sortExpression
    } else {
      this.sortExpression = sort
    }
    if (this.autoRefresh) await this.refresh()
  }

  /** 设置过滤表达式并重置页码为 1（autoRefresh=true 时自动刷新） */
  async setFilter(filter: FilterExpression | undefined): Promise<void> {
    if (filter === undefined) {
      delete this.filterExpression
    } else {
      this.filterExpression = filter
    }
    this.page = 1
    if (this.autoRefresh) await this.refresh()
  }

  /** 级联委托（setupCascade / teardownCascade） */
  get cascade(): CascadeDelegate { return this.cascadeDelegate }

  // ─────────────────────────────────────────────
  // 生命周期（销毁与内存管理）
  // ─────────────────────────────────────────────

  /**
   * 销毁视图，释放所有订阅、委托和外部引用
   *
   * 应在资源释放时调用，防止内存泄漏。
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
    
    // 6. 清除计算列委托（内部清理跨表订阅 + 缓存 + 上下文）
    this._computedDelegate.destroy()

    // 7. 清除脏追踪委托
    this._dirtyTrackingDelegate?.destroy()
    this._dirtyTrackingDelegate = undefined

    // 8. 清除聚合委托
    this._aggregateDelegate = undefined

    // 9. 清除 TreeManager 引用（_treeHttp 随 DataView GC 自动释放，无需显式清除）
    this.treeManager = undefined
    
    // 10. 保留 DataTable 引用（现代 JS GC 能正确处理循环引用）。
    // Phase 4 M6: 不再 undefined dataTable，避免销毁后访问 getter（dataSet/crudService 等）
    // 抛出不明确的 "Cannot read property of undefined" 而非清晰的 "已销毁" 错误。
    
    // 11. 标记为已销毁
    this._isDestroyed = true
  }

  /** 检查视图是否已销毁 */
  isDestroyed(): boolean {
    return this._isDestroyed
  }

  /** @private 检查销毁状态，已销毁则抛出异常 */
  private checkDestroyed(): void {
    if (this._isDestroyed) {
      throw new Error(`DataView ${this.tableName}:${this.viewId} has been destroyed`)
    }
  }

  /** @private 检查 DataTable 是否已绑定，未绑定则抛出描述性异常 */
  private checkDataTableAttached(): DataTable {
    if (!this._dataTable) {
      throw new Error(
        `DataView ${this.tableName}:${this.viewId} 尚未关联 DataTable，` +
        `请通过 DataTable.getOrCreateView() 或 DataSet.fromConfig() 创建视图。`
      )
    }
    return this._dataTable
  }

  /** CrudDelegate 回调：追踪并发 CRUD 请求数，维护 mutating / mutatingError */
  private _trackMutating(delta: 1 | -1, error?: Error | null): void {
    this._mutatingCount = Math.max(0, this._mutatingCount + delta)
    this.mutating = this._mutatingCount > 0
    if (delta === 1) {
      this.mutatingError = null
    } else {
      if (error) this.mutatingError = error
    }
    this.events.emit('mutatingChanged', this.mutating)
  }

  // ─────────────────────────────────────────────
  // 序列化 / 反序列化
  // ─────────────────────────────────────────────

  /** 将 IViewMetadata 配置字段应用到当前视图实例（不创建新实例，不处理 rows）。 */
  applyViewConfig(vc: Partial<IViewMetadata>): void {
    if (vc.filterExpression !== undefined) this.filterExpression = vc.filterExpression
    if (vc.sortExpression !== undefined) this.sortExpression = vc.sortExpression
    if (vc.autoCurrentFirst !== undefined) this.autoCurrentFirst = vc.autoCurrentFirst
    if (vc.autoSelectFirst !== undefined) this.autoSelectFirst = vc.autoSelectFirst
    if (vc.treeConfig !== undefined) this.treeConfig = vc.treeConfig
    if (vc.autoLoad !== undefined) this.autoLoad = vc.autoLoad
    if (vc.autoRefresh !== undefined) this.autoRefresh = vc.autoRefresh
    // commitMode 优先；回退到旧 autoCommit 向后兼容
    if (vc.commitMode !== undefined) {
      this.commitMode = vc.commitMode
    } else if (vc.autoCommit !== undefined) {
      this.commitMode = vc.autoCommit ? 'immediate' : 'staged'
    }
    if (vc.valueField !== undefined) this.valueField = vc.valueField
    if (vc.labelField !== undefined) this.labelField = vc.labelField
    if (vc.selectionDelimiter !== undefined) this.selectionDelimiter = vc.selectionDelimiter
    if (vc.aggregates !== undefined) (this as { aggregates: Record<string, AggregateColumnConfig> }).aggregates = vc.aggregates
    this.page = vc.page ?? 1
    this.pageSize = vc.pageSize ?? 20
  }

  /** 对已有 rows 应用 autoCurrentFirst / autoSelectFirst 初始化选中状态（静态数据路径用） */
  initAutoSelection(): void {
    this.selectionDelegate.applyAutoFirst()
  }

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
    if (this.autoLoad !== false) result.autoLoad = this.autoLoad
    if (this.autoRefresh !== false) result.autoRefresh = this.autoRefresh
    if (this.commitMode !== 'immediate') result.commitMode = this.commitMode
    if (this.valueField !== undefined) result.valueField = this.valueField
    if (this.labelField !== undefined) result.labelField = this.labelField
    if (this.selectionDelimiter !== ',') result.selectionDelimiter = this.selectionDelimiter
    if (Object.keys(this.aggregates).length > 0) result.aggregates = this.aggregates
    return result
  }

  static fromData(data: IViewMetadata, tableName: string, viewId: string): DataView {
    const v = DataView.create(tableName, viewId)
    if (data.rows !== undefined) v.rows = [...data.rows]
    v.applyViewConfig(data)
    return v
  }

  /** 实例包装钩子——集成层可覆盖以添加自定义包装（如响应式代理） */
  static wrapInstance: (instance: DataView) => DataView = (v) => v

  /** @internal 创建 DataView 实例（通过 wrapInstance 钩子可选包装） */
  static create(tableName: string, viewId = 'default'): DataView {
    return DataView.wrapInstance(new DataView(tableName, viewId))
  }
}
