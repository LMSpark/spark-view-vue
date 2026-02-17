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

import type { IDataRow, IViewMetadata, FilterExpression, SortExpression, ViewStateEvent, DataRelation } from './types'
import type { TreeManager } from './tree-manager'
import { Logger, DATA_VIEW, DATA_SET, provide as setCapability, lookup, createEventEmitter } from '@spark-view/spark-utils'
import type { CapabilityName, ICapabilityContext, IEventEmitter } from '@spark-view/spark-utils'
import { isSameRow, getParentRows } from './core/utils'

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

export class DataView implements ICapabilityContext {
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
    const dsCap = lookup<{ dataSet: { relations?: DataRelation[]; getTable(n: string): { getOrCreateView(id: string): DataView } | undefined; requestTableData(n: string): void } }>(this, DATA_SET)
    if (!dsCap) return

    const ds = dsCap.dataSet
    // 查找以本视图为子的关系
    const parentRels = (ds.relations ?? []).filter(
      (r: DataRelation) => r.childTable === this.tableName && (r.childViewId ?? 'default') === this.viewId
    )

    for (const rel of parentRels) {
      const parentTable = ds.getTable(rel.parentTable)
      if (!parentTable) continue
      const parentView = parentTable.getOrCreateView(rel.parentViewId ?? 'default')

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
   * - 父有数据 + autoLoad → 请求自己的数据
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
      // 消费 DATA_SET 能力请求数据加载
      const dsCap = lookup<{ dataSet: { requestTableData(n: string): void } }>(this, DATA_SET)
      dsCap?.dataSet.requestTableData(this.tableName)
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
