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
 *   子视图通过 setupCascade() 订阅父视图的独立事件（currentRowChanged / rowsChanged 等），
 *   父状态变化时子视图自行决定：清空 or 重新请求。
 *
 * ## 请求编排
 *   requestData()   —— 上行入口（幂等、非阻塞）：解析父依赖 → 调用 loadFromServer → 子视图级联
 *   refresh()       —— 下行入口（强制、非阻塞）：重置 Idle → 调用 requestData()
 *   两者均立即返回，结果通过独立事件通知；loadFromServer() 可 await（有返回值）
 *   requestState    —— 唯一状态源（RequestState 枚举），禁止另设布尔别名
 *
 * ## 委托分工
 *   CrudDelegate    —— 单条 / 批量 CRUD、校验、生命周期钩子、mutating 状态
 *   CascadeDelegate —— 父视图依赖订阅 / 响应 / 防抖级联
 */

import type {
  IDataRow, IViewMetadata, FilterExpression, SortExpression,
  QueryParams,
  CrudResult, BatchResult, CrudOperationConfig,
  IDataSource,
  FlatTreeNode, TreePath, NestedTreeSearchResult,
  TreeConfig,
  DataRelation,
  AggregateType,
} from './types'
import { RequestState } from './types'
import { TreeManager } from './tree-manager'
import type { DataTable } from './data-table'
import type { CrudService } from './crud-service'
import type { DataValidator } from './validation'
import { Logger, createEventEmitter } from '@spark-view/spark-utils'
import type { IEventEmitter } from '@spark-view/spark-utils'
import { isSameRow, getParentRows, assertNoSeparator } from './core/utils'
import { CrudDelegate } from './strategies/crud-delegate'
import { CascadeDelegate } from './strategies/cascade-delegate'
import { SelectionDelegate } from './strategies/selection-delegate'
import { LocalMutationDelegate } from './strategies/local-mutation-delegate'
import type { CrudLifecycleEvent } from './strategies/types'
import type { PrimaryKeyGenerator, PrimaryKeyGeneratorConfig } from './core/primary-key-generator'
import { createPrimaryKeyGenerator } from './core/primary-key-generator'
import { ComputedColumnDelegate, compileColumnsExpressions } from './strategies/computed-column-delegate'
import type { ComputedColumnContext, AggregateResolver } from './strategies/computed-column-delegate'
import { DirtyTrackingDelegate } from './strategies/dirty-tracking-delegate'
import type { RowDiff, SaveChangesData } from './strategies/dirty-tracking-delegate'

// ─────────────────────────────────────────────
// 事件类型映射
// ─────────────────────────────────────────────

/**
 * DataView 事件映射（用于 events 事件总线类型约束）
 *
 * 独立事件模型：每种变化对应独立事件名，消费端按需订阅。
 */
// Note: any[] 在此处是合理的泛型约束（与 IEventEmitter 接口保持一致）
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
  /** CRUD 提交前事件——业务脚本可调用 event.cancel() 取消操作 */
  'crud:before': [CrudLifecycleEvent]
  /** CRUD 提交后事件——业务脚本可根据 result 执行联动 */
  'crud:after': [CrudLifecycleEvent]
}

// ─────────────────────────────────────────────
// DataView 类
// ─────────────────────────────────────────────

export class DataView implements IDataSource {

  // ── DataTable 引用（运行时注入，由 DataTable 在 attach 时赋值）────────

  /** 内部存储的 DataTable 引用 */
  private _dataTable!: DataTable

  /** 所属 DataTable（赋值时自动编译 columns 中的 computeExpression，不求值） */
  get dataTable(): DataTable { return this._dataTable }
  set dataTable(table: DataTable) {
    this._dataTable = table
    // 编译是 DataTable 的事：attach 后立即编译 computeExpression（不求值）
    this._compileCacheKey = undefined   // DataSet 可能已变更
    this._syncComputedFromConfig()
  }

  // ── 标识 ────────────────────────────────────

  tableName: string
  viewId: string

  // ── 行数据 ──────────────────────────────────

  rows: IDataRow[] = []

  // ── 主键 ────────────────────────────────────

  /**
   * 显式覆盖的主键字段名（undefined = 从 DataTable 列定义推导）。
   * 通过 primaryKey getter/setter 访问；外部直接赋值会写入此字段。
   */
  private _primaryKeyOverride?: string | string[] | undefined

  /**
   * 主键字段名（支持单主键字符串或多主键数组）。
   *
   * 解析优先级：
   * 1. 显式覆盖值（通过 `view.primaryKey = 'xxx'` 设置）
   * 2. DataTable 列定义中 `isPrimaryKey: true` 的列名
   * 3. 回退默认值 `'id'`
   */
  get primaryKey(): string | string[] {
    if (this._primaryKeyOverride !== undefined) return this._primaryKeyOverride
    // 从 DataTable 列定义自动推导
    if (this.dataTable?.columns?.length) {
      const pkCols = this.dataTable.columns.filter(c => c.isPrimaryKey)
      if (pkCols.length === 1) {
        const col = pkCols[0]
        if (col) return col.name
      }
      if (pkCols.length > 1) return pkCols.map(c => c.name)
    }
    return 'id'
  }

  set primaryKey(value: string | string[]) {
    this._primaryKeyOverride = value
  }

  /**
   * 清除显式覆盖，恢复从 DataTable 列定义自动推导主键。
   *
   * @example
   * view.primaryKey = 'uuid'        // 显式覆盖
   * view.resetPrimaryKey()          // 恢复列推导
   * view.primaryKey                 // → 推导自 isPrimaryKey 列，或回退 'id'
   */
  resetPrimaryKey(): void {
    this._primaryKeyOverride = undefined
  }
  
  /** 主键生成器（可选，用于自动生成新记录的主键） */
  private primaryKeyGenerator?: PrimaryKeyGenerator | undefined

  // ── 选中状态（主键存储，getter 按需解析）────

  /** 当前行主键值（null 表示未选中）。通过 currentRow getter 取对应行对象 */
  _currentRowId: string | number | null = null
  /** 多选行主键值列表。通过 selectedRows getter 取对应行对象数组 */
  _selectedRowIds: Array<string | number> = []

  // ── 选中值序列化配置（单选 / 多选通用）────

  /**
   * 值字段名（用于 value getter/setter 序列化）。
   * 未指定时回退到主键字段。
   *
   * - 单字段：`'code'` → value 返回各选中行的 code 字段值
   * - 多字段（复合值）：`['code', 'region']` → value 以 `:` 连接各字段，如 `'A:US'`
   */
  valueField?: string | string[]
  /**
   * 标签显示字段名（用于 labels / label getter，渲染 tag 时使用）。
   * 未指定时回退到主键值字符串。
   * 示例：labelField = 'name' → labels 返回各选中行的 name 字段值。
   */
  labelField?: string
  /**
   * 值序列化分隔符（默认 ','）。
   *
   * - **非空字符串**（`','` / `'|'` / `';'` 等）：多选模式，selectedValue 以此分隔多个主键值
   * - **空字符串 `''`**：单选模式，selectedValue 仅保留一个值，setSelectedValue 不拆分
   *
   * 通过 {@link isMultiSelect} getter 可读取当前模式。
   */
  selectionDelimiter: string = ','

  /**
   * 是否为多选模式（selectionDelimiter 非空时为多选，空字符串为单选）。
   *
   * @example
   * view.selectionDelimiter = ','  // isMultiSelect → true
   * view.selectionDelimiter = ''   // isMultiSelect → false（单选）
   */
  get isMultiSelect(): boolean { return this.selectionDelimiter !== '' }

  /** 当前行（getter：从 rows 中按主键查找；rows 刷新后自动指向新对象） */
  get currentRow(): IDataRow | null {
    if (this._currentRowId === null) return null
    return this.rows.find(r => this.getPrimaryKeyValue(r) === this._currentRowId) ?? null
  }

  /** 多选行数组（getter：从 rows 中按主键集合过滤；rows 刷新后自动指向新对象） */
  get selectedRows(): IDataRow[] {
    if (this._selectedRowIds.length === 0) return []
    const idSet = new Set(this._selectedRowIds)
    return this.rows.filter(r => {
      const pk = this.getPrimaryKeyValue(r)
      return pk !== undefined && idSet.has(pk)
    })
  }

  // ── 值序列化层（委托给 SelectionDelegate）────

  /**
   * 选中行的序列化字符串（供表单 v-model / API 传值使用）。
   * 完整逻辑见 {@link SelectionDelegate.value}。
   *
   * @example
   * view.value = '1,2,3'  // 多选 → [row1, row2, row3]
   * view.value = '1'      // 单选 → [row1]
   * view.value = ''       // 清空
   */
  get value(): string { return this.selectionDelegate.value }
  set value(v: string | null | undefined) { this.selectionDelegate.value = v }

  /**
   * 选中行的显示标签数组（供渲染 tag 使用）。
   * 有 {@link labelField} 时取字段值；否则回退到主键字符串。
   */
  get labels(): string[] { return this.selectionDelegate.labels }

  /**
   * 当前行的显示标签（供单选 tag / 面包屑使用）。
   * 无当前行时返回 null。
   */
  get label(): string | null { return this.selectionDelegate.label }

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
  /**
   * setCurrentRow 时是否自动同步 selectedRows（默认 true）
   *
   * - `true`（默认）：常规表格模式——selectedRows 始终包含 currentRow。
   *            调用 setCurrentRow(row) 时，selectedRows 自动替换为 [row]；
   *            清空当前行时 selectedRows 同步清空。
   * - `false`：购物车模式——currentRow 与 selectedRows 完全独立。
   *            点击行只改变焦点 / 高亮，selectedRows 仅通过 checkbox 手动管理。
   *
   * 注意：此属性不影响服务端加载后的自动首选行为，
   * 那部分仍由 autoCurrentFirst / autoSelectFirst 独立控制。
   */
  selectionFollowsCurrent: boolean = true
  /** 树结构字段配置（idField/parentIdField/textField/depthLimit/lazy/treeMode） */
  treeConfig?: TreeConfig | undefined

  /**
   * 是否在 DataSet 初始化后自动加载数据（默认 false）。
   * 渲染层在构建 DataSet 后检查此标志，对 default 视图自动调用 requestData()。
   */
  autoLoad: boolean = false

  /**
   * 设置分页、排序、过滤等参数后是否自动刷新数据（默认 false）。
   *
   * 设为 `true` 时，调用 `setPage()` / `setPageSize()` / `setSort()` / `setFilter()`
   * 会在修改参数后自动调用 `refresh()`，消费层无需手动触发刷新。
   * 设为 `false` 时，上述方法仅修改参数，消费层需手动调用 `refresh()`。
   */
  autoRefresh: boolean = false

  /**
   * 增删改是否自动提交到服务端（默认 `false`）。
   *
   * - `false`（默认）：`addRow` / `editRowById` / `removeRow` 仅修改内存，
   *   需调用 `saveChanges()` 批量提交。
   * - `true`：每次 `addRow` / `editRowById` / `removeRow` 立即调用对应网络 CRUD 方法。
   */
  autoCommit: boolean = false

  /** 树视图模式，代理到 treeConfig.treeMode（默认 'flat'） */
  get treeMode(): 'flat' | 'nested' { return this.treeConfig?.treeMode ?? 'flat' }
  set treeMode(v: 'flat' | 'nested') { (this.treeConfig ??= {}).treeMode = v }

  // ── 计算列 ────────────────────────────────────────────

  /**
   * 设置计算列共享上下文（表达式中通过 `ctx` 引用）。
   * 设置后重新编译所有配置驱动的计算列并对现有 rows 求值。
   *
   * @example
   * view.setComputedContext({ taxRate: 0.13, discountMap: { VIP: 0.9 } })
   */
  setComputedContext(ctx: ComputedColumnContext): void {
    this._computedContext = ctx
    this._compileCacheKey = undefined   // 失效缓存，强制重编译
    this._syncComputedFromConfig()      // ctx 变更 → 重新编译配置列闭包
    this._applyComputedColumns(this.rows)
    this._recomputeSummary()
  }

  /**
   * 手动触发全量计算列重新求值（使用已编译的缓存函数）。
   *
   * 常规行操作（appendRow / updateRowById / replaceRows / updateFromServer）
   * 已自动触发求值。此方法用于：
   * - 子表行变更后通知父表重新计算聚合
   * - 直接修改 rows 后手动重算
   */
  recomputeColumns(): void {
    this._applyComputedColumns(this.rows)
    this._recomputeSummary()
  }

  /** @internal 已注册的计算列名集合（CrudDelegate 用于提交前剥离） */
  get computedColumnNames(): ReadonlySet<string> {
    return this._computedDelegate.names
  }

  /** @internal 从数据对象中移除计算列字段，返回浅拷贝；无计算列时返回原对象。 */
  stripComputedColumns(data: Partial<IDataRow>): Partial<IDataRow> {
    return this._computedDelegate.strip(data)
  }

  /** @internal 失效编译缓存，下次 _syncComputedFromConfig 将强制重编译。 */
  _invalidateCompiledCache(): void {
    this._compileCacheKey = undefined
  }

  /** 对行集合执行计算列求值（就地写入）——供 DataView 内部调用。 */
  private _applyComputedColumns(rows: IDataRow[]): void {
    this._computedDelegate.apply(rows)
  }

  // ── summaryRow 列级聚合 ────────────────────────────

  /** 列级聚合缓存行（行变更后自动重算） */
  private _summaryRow: IDataRow = {}
  /** 选中行聚合缓存行（选中/数据变更后自动重算） */
  private _selectionSummaryRow: IDataRow = {}

  /**
   * 列级聚合汇总行——根据 DataColumn.aggregate 配置自动计算。
   *
   * 行变更（append / update / delete / replace / updateFromServer）后自动重算，
   * 无需手动触发。计算列字段也可配置 aggregate，先逐行求值再整列聚合。
   *
   * @example
   * // DataColumn 配置
   * { name: 'amount', type: 'number', aggregate: 'sum' }
   * { name: 'total', type: 'number', computeExpression: 'price * qty', aggregate: 'sum' }
   *
   * // UI 绑定
   * view.summaryRow.amount   // 所有行 amount 之和
   * view.summaryRow.total    // 所有行计算后 total 之和
   */
  get summaryRow(): Readonly<IDataRow> {
    return this._summaryRow
  }

  /**
   * 选中行聚合汇总行——与 summaryRow 相同的聚合逻辑，但仅对 selectedRows 执行。
   *
   * 选中行变更、行数据变更后自动重算。无选中行时返回空对象。
   *
   * @example
   * view.selectionSummaryRow.amount   // 选中行 amount 之和
   */
  get selectionSummaryRow(): Readonly<IDataRow> {
    return this._selectionSummaryRow
  }

  /**
   * 重新计算 summaryRow（根据 DataTable 列定义中的 aggregate 配置）。
   *
   * 时序保证：必须在 `_applyComputedColumns()` 之后调用，
   * 这样计算列的值已就位，聚合结果正确。
   */
  private _recomputeSummary(): void {
    const columns = this._dataTable?.columns
    if (!columns?.length) { this._summaryRow = {}; return }

    // 收集带 aggregate 的列
    const aggCols: Array<{ name: string; aggregate: AggregateType }> = []
    for (const col of columns) {
      if (col.aggregate) aggCols.push({ name: col.name, aggregate: col.aggregate })
    }
    if (aggCols.length === 0) { this._summaryRow = {}; return }

    const rows = this.rows
    const result: IDataRow = {}

    for (const { name, aggregate } of aggCols) {
      switch (aggregate) {
        case 'sum': {
          let s = 0
          for (const r of rows) s += Number(r[name] ?? 0)
          result[name] = s
          break
        }
        case 'count': {
          let c = 0
          for (const r of rows) if (r[name] !== null && r[name] !== undefined) c++
          result[name] = c
          break
        }
        case 'avg': {
          if (rows.length === 0) { result[name] = 0; break }
          let s = 0
          for (const r of rows) s += Number(r[name] ?? 0)
          result[name] = s / rows.length
          break
        }
        case 'min': {
          if (rows.length === 0) { result[name] = undefined; break }
          let m = Infinity
          for (const r of rows) {
            const v = Number(r[name])
            if (!isNaN(v) && v < m) m = v
          }
          result[name] = m === Infinity ? undefined : m
          break
        }
        case 'max': {
          if (rows.length === 0) { result[name] = undefined; break }
          let m = -Infinity
          for (const r of rows) {
            const v = Number(r[name])
            if (!isNaN(v) && v > m) m = v
          }
          result[name] = m === -Infinity ? undefined : m
          break
        }
        case 'join': {
          const parts: string[] = []
          for (const r of rows) {
            const v = r[name]
            if (v !== null && v !== undefined && v !== '') parts.push(String(v))
          }
          result[name] = parts.join(',')
          break
        }
      }
    }

    this._summaryRow = result
    // 行数据变更时，选中行的值也可能变化，需同步重算
    this._recomputeSelectionSummary()
  }

  /**
   * 重新计算 selectionSummaryRow（与 _recomputeSummary 相同逻辑，但仅对 selectedRows）。
   */
  private _recomputeSelectionSummary(): void {
    const columns = this._dataTable?.columns
    if (!columns?.length) { this._selectionSummaryRow = {}; return }

    const aggCols: Array<{ name: string; aggregate: AggregateType }> = []
    for (const col of columns) {
      if (col.aggregate) aggCols.push({ name: col.name, aggregate: col.aggregate })
    }
    if (aggCols.length === 0) { this._selectionSummaryRow = {}; return }

    const rows = this.selectedRows
    if (rows.length === 0) { this._selectionSummaryRow = {}; return }

    const result: IDataRow = {}

    for (const { name, aggregate } of aggCols) {
      switch (aggregate) {
        case 'sum': {
          let s = 0
          for (const r of rows) s += Number(r[name] ?? 0)
          result[name] = s
          break
        }
        case 'count': {
          let c = 0
          for (const r of rows) if (r[name] !== null && r[name] !== undefined) c++
          result[name] = c
          break
        }
        case 'avg': {
          let s = 0
          for (const r of rows) s += Number(r[name] ?? 0)
          result[name] = s / rows.length
          break
        }
        case 'min': {
          let m = Infinity
          for (const r of rows) {
            const v = Number(r[name])
            if (!isNaN(v) && v < m) m = v
          }
          result[name] = m === Infinity ? undefined : m
          break
        }
        case 'max': {
          let m = -Infinity
          for (const r of rows) {
            const v = Number(r[name])
            if (!isNaN(v) && v > m) m = v
          }
          result[name] = m === -Infinity ? undefined : m
          break
        }
        case 'join': {
          const parts: string[] = []
          for (const r of rows) {
            const v = r[name]
            if (v !== null && v !== undefined && v !== '') parts.push(String(v))
          }
          result[name] = parts.join(',')
          break
        }
      }
    }

    this._selectionSummaryRow = result
  }

  /**
   * 从 DataTable 列定义（`DataColumn.computeExpression`）编译并注册到委托。
   * 内置编译缓存：列指纹 + ctx 引用不变时跳过重编译。
   *
   * **职责分工**：DataTable 是列配置的所有者；DataView 持有 context 与聚合解析器
   * （需要 tableName / viewId / primaryKey 视角 + DataSet 关系信息）。
   */
  private _compileCacheKey: string | undefined
  private _syncComputedFromConfig(): void {
    const columns = this._dataTable?.columns
    if (!columns?.length) return

    // 编译缓存：列表达式指纹 + ctx 对象引用
    const exprFingerprint = columns
      .filter(c => c.computeExpression)
      .map(c => `${c.name}:${c.computeExpression}`)
      .join('|')
    const cacheKey = `${exprFingerprint}@@${this._computedContext ? JSON.stringify(this._computedContext) : ''}`
    if (cacheKey === this._compileCacheKey) return   // 缓存命中，跳过编译
    this._compileCacheKey = cacheKey

    const compiled = compileColumnsExpressions(
      columns,
      this._computedContext,
      this._createAggregateResolver(),
    )
    for (const [name, fn] of compiled) this._computedDelegate.register(name, fn)
  }

  /**
   * 构建聚合解析器——子表行解析 + 跨表 summaryRow 访问。
   *
   * - 子表行解析：需要 DataRelation 配置，用于 `$sum/$count/$avg/$min/$max/$list/$join`
   * - 跨表聚合：仅需 DataSet 存在，用于 `$summary/$selectionSummary`
   */
  private _createAggregateResolver(): AggregateResolver | undefined {
    const ds = this._dataTable?.dataSet
    if (!ds) return undefined

    const relations = ds.relations?.length
      ? ds.getChildRelations(this.tableName, this.viewId)
      : []

    // 双重索引：精确键 "childTable@childViewId" + 短键 "childTable"（取第一匹配）
    const relMap = new Map<string, DataRelation>()
    for (const r of relations) {
      const vid = r.childViewId ?? 'default'
      relMap.set(`${r.childTable}@${vid}`, r)
      if (!relMap.has(r.childTable)) relMap.set(r.childTable, r)
    }

    const pk = this.primaryKey
    const defaultParentField = typeof pk === 'string' ? pk : (pk[0] ?? 'id')

    return {
      resolveChildRows: (childRef: string, parentRow: IDataRow): IDataRow[] => {
        const rel = relMap.get(childRef)
        if (!rel) return []
        const parentField = rel.parentField ?? defaultParentField
        const parentValue = parentRow[parentField]
        if (parentValue === null || parentValue === undefined) return []
        const childView = ds.getView(rel.childTable, rel.childViewId ?? 'default')
        if (!childView) return []
        const childField = rel.childField
        if (!childField) return []
        return childView.rows.filter(r => r[childField] === parentValue)
      },
      resolveSummary: (viewRef: string, field: string): unknown => {
        const at = viewRef.indexOf('@')
        const tableName = at >= 0 ? viewRef.slice(0, at) : viewRef
        const viewId = at >= 0 ? viewRef.slice(at + 1) : 'default'
        const view = ds.getView(tableName, viewId)
        return view?.summaryRow[field]
      },
      resolveSelectionSummary: (viewRef: string, field: string): unknown => {
        const at = viewRef.indexOf('@')
        const tableName = at >= 0 ? viewRef.slice(0, at) : viewRef
        const viewId = at >= 0 ? viewRef.slice(at + 1) : 'default'
        const view = ds.getView(tableName, viewId)
        return view?.selectionSummaryRow[field]
      },
    }
  }

  // ── 关联对象 ────────────────────────────────

  treeManager?: TreeManager | undefined

  // ── 私有 ─────────────────────────────────────

  /** 当前 loadFromServer 请求 ID（用于防止竞态） */
  private currentLoadRequestId = 0
  /** 并发 CRUD 请求计数器（支持多操作同时在途） */
  private _mutatingCount = 0
  /** 销毁状态标记 */
  private _isDestroyed = false
  /** 行索引缓存（用于加速 updateRowById 行对象替换）——由 LocalMutationDelegate 管理，内部状态勿直接操作 */
  rowIndexMap?: Map<IDataRow, number> | undefined
  /** rowsChanged 事件防抖定时器 */
  private stateChangedDebouncer?: ReturnType<typeof setTimeout> | undefined

  // ── 委托 ─────────────────────────────────────

  /** 计算列委托（立即初始化，因 dataTable setter 可能在第一次懒访问之前触发） */
  private _computedDelegate: ComputedColumnDelegate = new ComputedColumnDelegate()
  /** 计算列表达式共享上下文（表达式中以 `ctx` 引用），默认空对象 */
  private _computedContext: ComputedColumnContext = {}
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
    )
    return this._localMutationDelegate
  }

  /** 获取手工编辑追踪委托（懒初始化） */
  private get dirtyTrackingDelegate(): DirtyTrackingDelegate {
    this._dirtyTrackingDelegate ??= new DirtyTrackingDelegate()
    return this._dirtyTrackingDelegate
  }
  
  // ── 公共委托访问器（S1: 高级消费者可直接访问委托实例）────────

  /**
   * 选中状态委托（只读访问）。
   *
   * 高级场景可直接调用 `view.selection.addSelectedRows(...)` 等方法，
   * DataView 上的同名方法是简化的委托透传入口。
   */
  get selection(): SelectionDelegate { return this.selectionDelegate }

  /**
   * 本地内存变更委托（只读访问）。
   *
   * 高级场景可直接调用 `view.mutation.appendRow(...)` 等方法，
   * DataView 上的同名方法是简化的委托透传入口。
   */
  get mutation(): LocalMutationDelegate { return this.localMutationDelegate }

  /**
   * 网络 CRUD 委托（只读访问）。
   *
   * 高级场景可直接调用 `view.crud.createRecord(...)` 等方法，
   * DataView 上的同名方法是简化的委托透传入口。
   */
  get crud(): CrudDelegate { return this.crudDelegate }

  /**
   * 手工编辑追踪委托（只读访问）。
   *
   * 提供细粒度 dirty 追踪 API：isDirty、getOriginal、getDiff、dirtyRowIds。
   * DataView 上的 editRowById / isDirty / dirtyRows / getDirtyChanges / clearDirty
   * 是常用操作的便捷入口。
   */
  get dirtyTracking(): DirtyTrackingDelegate { return this.dirtyTrackingDelegate }

  // ── 公共内部对象 ─────────────────────────

  /**
   * 事件总线——独立事件模型
   *
   * UI 组件、子视图级联、外部监听者按需订阅：
   * - `events.on('currentRowChanged', handler)` — 当前行变化
   * - `events.on('selectedRowsChanged', handler)` — 选中行变化
   * - `events.on('rowsChanged', handler)` — 行数据变化（防抖 16ms）
   * - `events.on('cleared', handler)` — 数据清空
   * - `events.on('requestStateChanged', handler)` — 请求状态变化
   * - `events.on('mutatingChanged', handler)` — CRUD 变更状态
   */
  readonly events: IEventEmitter<DataViewEventMap> = createEventEmitter()

  protected logger = Logger('DataView')

  // ─────────────────────────────────────────────
  // 构造
  // ─────────────────────────────────────────────

  constructor(tableName: string, viewId: string = 'default') {
    assertNoSeparator(tableName, 'tableName')
    assertNoSeparator(viewId, 'viewId')
    this.tableName = tableName
    this.viewId = viewId
  }

  // ─────────────────────────────────────────────
  // 接口实现 getter（ICrudHost / ICascadeHost）
  // 将 DataTable 属性转发给委托层，委托层不持有 DataTable 直接引用
  // ─────────────────────────────────────────────

  /** ICascadeHost：向上访问 DataSet，供 CascadeDelegate 解析父子关系 */
  get dataSet() {
    this.checkDestroyed()
    this.checkDataTableAttached()
    return this.dataTable.dataSet
  }

  /** ICrudHost：CrudService 实例（DataTable 持有并缓存；未配置 API 时为 undefined） */
  get crudService(): CrudService | undefined { this.checkDestroyed(); this.checkDataTableAttached(); return this.dataTable.crudService }
  /** ICrudHost：CRUD 操作全局配置（超时、重试等） */
  get crudConfig(): CrudOperationConfig | undefined { this.checkDestroyed(); this.checkDataTableAttached(); return this.dataTable.crudConfig }
  /** ICrudHost：数据校验器 */
  get validator(): DataValidator | undefined { this.checkDestroyed(); this.checkDataTableAttached(); return this.dataTable.validator }

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
   * 4. 子视图级联由 rowsChanged 事件驱动（子订阅父，父不知子），无需主动推
   *
   * @internal 外部应使用 `refresh()`（强制刷新）或 `loadFromServer()`（自定义参数）。
   *           `requestData()` 为框架内部编排方法（级联、autoLoad 等场景使用）。
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
      const pf = rel.parentField as unknown
      if (typeof pf === 'string') {
        parentKey = pf
      } else {
        // 回退到父视图的 primaryKey 配置（Phase 3 S1: 消除硬编码 'id'）
        parentKey = typeof pView.primaryKey === 'string' ? pView.primaryKey : pView.primaryKey[0]
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

    // 注入视图自身的分页/排序/过滤参数
    if (this.page !== undefined) params.page = this.page
    if (this.pageSize !== undefined) params.pageSize = this.pageSize
    if (this.sortExpression !== undefined) params.sort = this._serializeSort(this.sortExpression)
    if (this.filterExpression !== undefined) params.filter = this.filterExpression

    try {
      const result = await this.loadFromServer(params)
      if (!result.success) return
    } catch {
      return
    }

    // 子视图级联由 rowsChanged 事件驱动（respondToParentChange），无需主动推
  }

  /**
   * 从服务器拉取列表（带防重入 + 请求 ID 竞态保护）
   *
   * 通常由 `requestData()` 内部调用；也可直接调用以跳过父依赖编排。
   *
   * - 成功：updateFromServer() 写入行数据，处理 autoCurrentFirst/autoSelectFirst，
   *         requestState=Loaded，发射 rowsChanged
   * - 失败：requestState=Failed，发射 requestStateChanged，重新抛出异常
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
      
      this.loadingError = error as Error
      this.requestState = RequestState.Failed
      this.events.emit('requestStateChanged', this.requestState)
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

  /** 批量更新（items 中必须包含主键字段，主键名由 primaryKey 配置决定） */
  async batchUpdateRecords(items: Array<Partial<IDataRow>>): Promise<CrudResult<BatchResult>> {
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
  // 两者均发射 rowsChanged，因防抖合并为单次通知
  // ─────────────────────────────────────────────

  /** 将服务端响应同步到本地字段（rows / total / page / pageSize）——splice 保持数组引用稳定，对 Vue 响应式友好 */
  updateFromServer(data: { rows?: IDataRow[]; total?: number; page?: number; pageSize?: number } | IDataRow[]): void {
    this.localMutationDelegate.updateFromServer(data)
    this._applyComputedColumns(this.rows)
    this._recomputeSummary()
  }

  /** 本地追加一行，发射 rowsChanged */
  appendRow(row: IDataRow): void {
    this.localMutationDelegate.appendRow(row)
    this._applyComputedColumns([row])
    this._recomputeSummary()
  }

  /** 本地按主键部分更新一行，发射 rowsChanged；返回是否成功（行不存在时 false） */
  updateRowById(id: string | number, data: Partial<IDataRow>): boolean {
    const result = this.localMutationDelegate.updateRowById(id, data)
    if (result) {
      // 更新成功，对受影响的行重新求值计算列
      const row = this.rows.find(r => this.getPrimaryKeyValue(r) === id)
      if (row) this._applyComputedColumns([row])
      this._recomputeSummary()
    }
    return result
  }

  /** 本地按主键删除一行，清理选中引用，发射 rowsChanged；返回是否成功（行不存在时 false） */
  deleteRowById(id: string | number): boolean {
    const result = this.localMutationDelegate.deleteRowById(id)
    if (result) this._recomputeSummary()
    return result
  }

  /** 本地整批替换所有行（响应式安全），清理无效选中引用，发射 rowsChanged */
  replaceRows(rows: IDataRow[]): void {
    this.localMutationDelegate.replaceRows(rows)
    this._applyComputedColumns(this.rows)
    this._recomputeSummary()
  }

  // ─────────────────────────────────────────────
  // 手工编辑（带脏追踪）
  // ─────────────────────────────────────────────

  /**
   * **本地新增行**，并登记为待新增（`autoCommit=false`）或立即提交（`autoCommit=true`）。
   *
   * - `autoCommit=false`（默认）：将行追加到 `rows`，标记为 pending-create，
   *   调用 `saveChanges()` 时统一提交。
   * - `autoCommit=true`：直接调用 `createRecord`，由 CRUD 生命周期处理后回写。
   *
   * @param data 行数据。若配置了 `primaryKeyGenerator` 且行中缺少主键，则自动补充。
   * @returns `autoCommit=false` 时返回追加后的行对象；`autoCommit=true` 时返回 `CrudResult<IDataRow>`
   */
  async addRow(data: Partial<IDataRow>): Promise<IDataRow | CrudResult<IDataRow>> {
    this.checkDestroyed()
    const row = this.ensurePrimaryKey(data)
    if (this.autoCommit) {
      return this.crudDelegate.createRecord(row)
    }
    this.appendRow(row)
    const id = this.getPrimaryKeyValue(row)
    if (id !== undefined) {
      this.dirtyTrackingDelegate.trackCreate(id, row)
    }
    return row
  }

  /**
   * **本地删除行**，并登记为待删除（`autoCommit=false`）或立即提交（`autoCommit=true`）。
   *
   * - `autoCommit=false`（默认）：从 `rows` 中移除该行并标记为 pending-delete，
   *   调用 `saveChanges()` 时统一提交。
   * - `autoCommit=true`：直接调用 `deleteRecord`，由 CRUD 生命周期处理。
   *
   * @param id 行主键
   * @returns `autoCommit=false` 时返回是否删除成功的布尔值；`autoCommit=true` 时返回 `CrudResult<boolean>`
   */
  async removeRow(id: string | number): Promise<boolean | CrudResult<boolean>> {
    this.checkDestroyed()
    if (this.autoCommit) {
      return this.crudDelegate.deleteRecord(id)
    }
    const snapshot = this.rows.find(r => this.getPrimaryKeyValue(r) === id)
    if (!snapshot) return false
    const result = this.deleteRowById(id)
    if (result) {
      this.dirtyTrackingDelegate.trackDelete(id, snapshot)
    }
    return result
  }

  /**
   * **手工编辑**指定行的字段值，并将该行标注为脏（有未保存变更）。
   *
   * 与 `updateRowById` 的区别：
   * - `updateRowById` —— 服务端写入路径（CRUD 响应回写），**不**标脏
   * - `editRowById`   —— 用户手工编辑路径（表格内联编辑、表单回写等），**标脏**
   *
   * 连续多次 editRowById 同一行只保留**首次**编辑前的快照，
   * 确保 getDirtyChanges 始终对比原始服务端值。
   *
   * - `autoCommit=false`（默认）：仅更新内存并标脏，需调用 `saveChanges()` 提交。
   * - `autoCommit=true`：立即调用 `updateRecord`，成功后自动清除脏标记。
   *
   * @param id   行主键
   * @param data 变更字段（Partial，不含主键字段）
   * @returns `autoCommit=false` 时返回布尔值；`autoCommit=true` 时返回 `CrudResult<IDataRow>`
   *
   * @example
   * view.editRowById(row.id, { name: '李四', age: 31 })
   * view.isDirty(row.id)         // true
   * view.getDirtyChanges(row.id) // { name: { from: '张三', to: '李四' }, age: { from: 30, to: 31 } }
   */
  async editRowById(
    id: string | number,
    data: Partial<IDataRow>,
  ): Promise<boolean | CrudResult<IDataRow>> {
    this.checkDestroyed()
    if (this.autoCommit) {
      return this.crudDelegate.updateRecord(id, data)
    }
    // 先获取编辑前快照（updateRowById 会替换行对象，必须在之前取）
    const original = this.rows.find(r => this.getPrimaryKeyValue(r) === id)
    if (!original) return false

    const result = this.updateRowById(id, data)
    if (result) {
      this.dirtyTrackingDelegate.markDirty(id, original)
    }
    return result
  }

  /**
   * 查询是否有任何本地未提交变更（新增、编辑、删除）。
   *
   * @param id 不传 → 整个视图是否有任意待提交（含 dirty/pending-create/pending-delete）；
   *           传入 id → 指定行是否有待提交变更
   */
  hasPendingChanges(id?: string | number): boolean {
    return this.dirtyTrackingDelegate.hasPendingChanges(id)
  }

  /**
   * 查询是否有手工未保存变更。
   *
   * @param id 不传 → 整个视图是否有任意脏行；传入 id → 指定行是否脏
   */
  isDirty(id?: string | number): boolean {
    return this.dirtyTrackingDelegate.isDirty(id)
  }

  /**
   * 当前所有脏行的行对象数组（按 rows 中的顺序）。
   *
   * 可用于批量预览变更、表格行高亮等场景。
   */
  get dirtyRows(): IDataRow[] {
    const ids = this.dirtyTrackingDelegate.dirtyRowIds
    if (ids.size === 0) return []
    return this.rows.filter(r => {
      const pk = this.getPrimaryKeyValue(r)
      return pk !== undefined && ids.has(pk)
    })
  }

  /**
   * 获取指定行的字段级变更明细。
   *
   * @param id 行主键
   * @returns 字段名 → `{ from（原始值）, to（当前值）}`；行不脏时返回 `{}`
   */
  getDirtyChanges(id: string | number): RowDiff {
    const current = this.rows.find(r => this.getPrimaryKeyValue(r) === id)
    if (!current) return {}
    return this.dirtyTrackingDelegate.getDiff(id, current)
  }

  /**
   * 清除指定行（或全部）的脏标记。
   *
   * 通常由 `saveChanges()` 在成功后自动调用；
   * 也可手动调用（如"放弃修改"时先还原数据再调用此方法）。
   *
   * @param id 不传则清除全部
   */
  clearDirty(id?: string | number): void {
    this.dirtyTrackingDelegate.clearDirty(id)
  }

  /**
   * 将本地所有待提交变更（新增 / 手工编辑 / 删除）逐条保存到服务端。
   *
   * 提交顺序：**新增 → 更新 → 删除**（依赖关系最少）
   *
   * - **新增**：调用 `createRecord`；成功后用服务端返回的行替换本地行，取消 pending-create 标记。
   * - **更新**：调用 `updateRecord`；成功后清除 dirty 标记。
   * - **删除**：调用 `deleteRecord`；成功后取消 pending-delete 标记（行已在 `removeRow` 时移出 rows）。
   *
   * 任意单行失败**不中断**后续行，方便精准重试；失败行保留对应追踪状态。
   *
   * @param ids 指定要保存的行主键列表；不传则保存**全部**待提交变更。
   *            传入的 id 会自动按所属状态分配到对应操作。
   * @returns `CrudResult<SaveChangesData>`，`success: true` 表示全部提交成功
   *
   * @example
   * const result = await view.saveChanges()
   * if (!result.success) {
   *   console.warn('部分行保存失败', result.data?.failedIds)
   * }
   */
  async saveChanges(ids?: Array<string | number>): Promise<CrudResult<SaveChangesData>> {
    this.checkDestroyed()
    const delegate = this.dirtyTrackingDelegate
    const filterByIds = ids !== undefined ? new Set(ids) : undefined

    const allPending = filterByIds === undefined && !delegate.hasPendingChanges()
    if (allPending) {
      return {
        success: true,
        message: '没有待提交的变更',
        data: { createdCount: 0, savedCount: 0, deletedCount: 0, failedCount: 0, failedIds: [] },
      }
    }

    let createdCount = 0
    let savedCount = 0
    let deletedCount = 0
    const failedIds: Array<string | number> = []

    // ── 1. 新增 ──────────────────────────────────────────────
    const createIds = filterByIds
      ? [...delegate.pendingCreateIds].filter(id => filterByIds.has(id))
      : [...delegate.pendingCreateIds]

    for (const tempId of createIds) {
      const row = this.rows.find(r => this.getPrimaryKeyValue(r) === tempId)
      if (!row) {
        delegate.cancelCreate(tempId)
        continue
      }
      try {
        const result = await this.crudDelegate.createRecord(this.stripComputedColumns({ ...row }))
        if (result.success) {
          delegate.cancelCreate(tempId)
          // 用服务端返回的行替换本地临时行（服务端可能分配新主键）
          if (result.data) {
            this.deleteRowById(tempId)
            this.appendRow(result.data)
          }
          createdCount++
        } else {
          failedIds.push(tempId)
        }
      } catch {
        failedIds.push(tempId)
      }
    }

    // ── 2. 更新 ──────────────────────────────────────────────
    const updateIds = filterByIds
      ? [...delegate.dirtyRowIds].filter(id => filterByIds.has(id))
      : [...delegate.dirtyRowIds]

    for (const id of updateIds) {
      const row = this.rows.find(r => this.getPrimaryKeyValue(r) === id)
      if (!row) {
        delegate.clearDirty(id)
        continue
      }
      try {
        const result = await this.crudDelegate.updateRecord(id, this.stripComputedColumns({ ...row }))
        if (result.success) {
          delegate.clearDirty(id)
          savedCount++
        } else {
          failedIds.push(id)
        }
      } catch {
        failedIds.push(id)
      }
    }

    // ── 3. 删除 ──────────────────────────────────────────────
    const deleteIds = filterByIds
      ? [...delegate.pendingDeleteIds].filter(id => filterByIds.has(id))
      : [...delegate.pendingDeleteIds]

    for (const id of deleteIds) {
      try {
        const result = await this.crudDelegate.deleteRecord(id)
        if (result.success) {
          delegate.cancelDelete(id)
          deletedCount++
        } else {
          failedIds.push(id)
        }
      } catch {
        failedIds.push(id)
      }
    }

    const failedCount = failedIds.length
    return {
      success: failedCount === 0,
      message: failedCount === 0
        ? `新增 ${createdCount} 行，更新 ${savedCount} 行，删除 ${deletedCount} 行`
        : `成功：新增 ${createdCount}，更新 ${savedCount}，删除 ${deletedCount}；失败 ${failedCount} 行`,
      data: { createdCount, savedCount, deletedCount, failedCount, failedIds },
    }
  }


  // ─────────────────────────────────────────────
  // 选中状态（委托给 SelectionDelegate）
  // ─────────────────────────────────────────────

  /**
   * 设置当前行。
   *
   * @param originatorId - 调用方实例 ID（可选）。
   *   传入时跳过该实例的 DataSet→UI 回写，避免循环；
   *   不传时所有订阅方均会收到更新。
   */
  setCurrentRow(row: IDataRow | null, originatorId?: string): void {
    this.selectionDelegate.setCurrentRow(
      row,
      originatorId !== undefined ? { originatorId } : undefined,
    )
  }

  /**
   * 设置多选行。
   * @param originatorId - 调用方实例 ID（同 setCurrentRow，可选）。
   */
  setSelectedRows(rows: IDataRow[], originatorId?: string): void {
    this.selectionDelegate.setSelectedRows(rows, originatorId)
  }

  setCurrentRowById(id: string | number): boolean {
    return this.selectionDelegate.setCurrentRowById(id)
  }

  setSelectedRowsById(
    ids: Array<string | number>,
    options?: { strict?: boolean }
  ): number {
    return this.selectionDelegate.setSelectedRowsById(ids, options)
  }

  clearSelectedRows(): void {
    this.selectionDelegate.clearSelectedRows()
  }

  addSelectedRows(rows: IDataRow[]): number {
    return this.selectionDelegate.addSelectedRows(rows)
  }

  removeSelectedRows(rows: IDataRow[]): number {
    return this.selectionDelegate.removeSelectedRows(rows)
  }

  addSelectedRowsById(
    ids: Array<string | number>,
    options?: { strict?: boolean }
  ): number {
    return this.selectionDelegate.addSelectedRowsById(ids, options)
  }

  removeSelectedRowsById(ids: Array<string | number>): number {
    return this.selectionDelegate.removeSelectedRowsById(ids)
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
   * 不发事件、不通知订阅者——该工作由调用方负责。
   */
  resetState(): void {
    this.rows.splice(0, this.rows.length)
    this._currentRowId = null
    this._selectedRowIds.splice(0, this._selectedRowIds.length)
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

  /** 懒初始化 TreeManager（传入 treeConfig 字段映射 + DataTable 的 api 和 HTTP 客户端） */
  private _ensureTreeManager(): TreeManager {
    if (!this.treeManager) {
      const cfg = this.treeConfig ?? {}
      // S3: 将 CrudService 的 HTTP 客户端传递给 TreeManager，共享拦截器/认证/配置
      const httpClient = this.dataTable?.crudService?.getHttpClient()
      this.treeManager = new TreeManager(cfg, this.dataTable?.api, undefined, httpClient)
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
  // 事件通知（独立事件模型）
  // ─────────────────────────────────────────────

  /** 发射 currentRowChanged 事件（立即） */
  private emitCurrentRowChanged(originatorId?: string): void {
    this.events.emit('currentRowChanged', this.currentRow, originatorId)
  }

  /** 发射 selectedRowsChanged 事件（立即） */
  private emitSelectedRowsChanged(originatorId?: string): void {
    this._recomputeSelectionSummary()
    this.events.emit('selectedRowsChanged', this.selectedRows, originatorId)
  }

  /**
   * 发射 rowsChanged 事件（防抖 16ms）
   *
   * 合并批量更新，减少重绘。防抖期间可能有更多状态变更，触发时读取最新状态。
   */
  private emitRowsChanged(): void {
    if (this.stateChangedDebouncer) {
      clearTimeout(this.stateChangedDebouncer)
    }
    this.stateChangedDebouncer = setTimeout(() => {
      this.events.emit('rowsChanged')
      this.stateChangedDebouncer = undefined
    }, 16)
  }

  /** 将 SortExpression 序列化为查询字符串格式（如 `name:asc` 或 `name:asc,age:desc`） */
  private _serializeSort(sort: SortExpression): string {
    if ('fields' in sort) {
      return sort.fields.map(f => `${f.field}:${f.direction.toLowerCase()}`).join(',')
    }
    return `${sort.field}:${sort.direction.toLowerCase()}`
  }

  // ─────────────────────────────────────────────
  // 请求参数便捷方法
  // ─────────────────────────────────────────────

  /**
   * 设置当前页（`autoRefresh=true` 时自动刷新）
   */
  async setPage(page: number): Promise<void> {
    this.page = page
    if (this.autoRefresh) await this.refresh()
  }

  /**
   * 设置每页条数并重置页码为 1（`autoRefresh=true` 时自动刷新）
   */
  async setPageSize(pageSize: number): Promise<void> {
    this.pageSize = pageSize
    this.page = 1
    if (this.autoRefresh) await this.refresh()
  }

  /**
   * 设置排序表达式（`autoRefresh=true` 时自动刷新）
   */
  async setSort(sort: SortExpression | undefined): Promise<void> {
    if (sort === undefined) {
      delete this.sortExpression
    } else {
      this.sortExpression = sort
    }
    if (this.autoRefresh) await this.refresh()
  }

  /**
   * 设置过滤表达式并重置页码为 1（`autoRefresh=true` 时自动刷新）
   */
  async setFilter(filter: FilterExpression | undefined): Promise<void> {
    if (filter === undefined) {
      delete this.filterExpression
    } else {
      this.filterExpression = filter
    }
    this.page = 1
    if (this.autoRefresh) await this.refresh()
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
    
    // 6. 清除计算列委托及上下文
    this._computedDelegate.destroy()
    this._computedContext = {}
    this._compileCacheKey = undefined

    // 7. 清除脏追踪委托
    this._dirtyTrackingDelegate?.destroy()
    this._dirtyTrackingDelegate = undefined

    // 8. 清除 TreeManager 引用（_treeHttp 随 DataView GC 自动释放，无需显式清除）
    this.treeManager = undefined
    
    // 8. 保留 DataTable 引用（现代 JS GC 能正确处理循环引用）。
    // Phase 4 M6: 不再 undefined dataTable，避免销毁后访问 getter（dataSet/crudService 等）
    // 抛出不明确的 "Cannot read property of undefined" 而非清晰的 "已销毁" 错误。
    
    // 9. 标记为已销毁
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
   * 检查 DataTable 是否已绑定，未绑定则抛出描述性异常。
   *
   * 独立创建的 DataView（如 SparkData.createDataView / DataView.fromData）
   * 未经过 DataTable 绑定流程，调用依赖 DataTable 的操作时会在此处捕获。
   *
   * @private 内部守卫，由依赖 dataTable 的 getter 调用
   */
  private checkDataTableAttached(): void {
    if (!this.dataTable) {
      throw new Error(
        `DataView ${this.tableName}:${this.viewId} is not attached to a DataTable. ` +
        `Use DataTable.getOrCreateView() or DataSet.fromConfig() instead of standalone DataView construction.`
      )
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
    this.events.emit('mutatingChanged', this.mutating)
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
    if (this.selectionFollowsCurrent !== true) result.selectionFollowsCurrent = this.selectionFollowsCurrent
    if (this.treeConfig !== undefined) result.treeConfig = this.treeConfig
    if (this.autoLoad !== false) result.autoLoad = this.autoLoad
    if (this.autoRefresh !== false) result.autoRefresh = this.autoRefresh
    if (this.autoCommit !== false) result.autoCommit = this.autoCommit
    if (this.valueField !== undefined) result.valueField = this.valueField
    if (this.labelField !== undefined) result.labelField = this.labelField
    if (this.selectionDelimiter !== ',') result.selectionDelimiter = this.selectionDelimiter
    return result
  }

  static fromData(data: IViewMetadata, tableName: string, viewId: string): DataView {
    const v = new DataView(tableName, viewId)
    if (data.rows !== undefined) v.rows = [...data.rows]
    if (data.filterExpression !== undefined) v.filterExpression = data.filterExpression
    if (data.sortExpression !== undefined) v.sortExpression = data.sortExpression
    // autoCurrentFirst / autoSelectFirst / selectionFollowsCurrent 默认为 true，只在显式指定时覆盖
    if (data.autoCurrentFirst !== undefined) v.autoCurrentFirst = data.autoCurrentFirst
    if (data.autoSelectFirst !== undefined) v.autoSelectFirst = data.autoSelectFirst
    if (data.selectionFollowsCurrent !== undefined) v.selectionFollowsCurrent = data.selectionFollowsCurrent
    if (data.treeConfig !== undefined) v.treeConfig = data.treeConfig
    if (data.autoLoad !== undefined) v.autoLoad = data.autoLoad
    if (data.autoRefresh !== undefined) v.autoRefresh = data.autoRefresh
    if (data.autoCommit !== undefined) v.autoCommit = data.autoCommit
    if (data.valueField !== undefined) v.valueField = data.valueField
    if (data.labelField !== undefined) v.labelField = data.labelField
    if (data.selectionDelimiter !== undefined) v.selectionDelimiter = data.selectionDelimiter
    v.page = data.page ?? 1
    v.pageSize = data.pageSize ?? 20
    return v
  }
}
