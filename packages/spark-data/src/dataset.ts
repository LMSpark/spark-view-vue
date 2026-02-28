/**
 * DataSet — 数据空间协调器（容器 + 数据管理）
 *
 * 职责：表注册管理查询、关系注册管理查询、数据加载协调
 * 不操作下层：不主动调用 DataView/DataTable 的方法来改变它们的状态
 * 不消费下层：不订阅 DataView 的事件（DataSet 是顶层）
 */

import type { IDataSet, IDataSetMetadata, ITableMetadata, IViewMetadata, DataRelation, IDataRow, DataColumn, CrudApi, ViewChangeHandlers } from './types'
import { RequestState } from './types'
import type { DataView as SparkDataView } from './data-view'
import type { Request } from '@spark-view/spark-utils'
import { DataTable } from './data-table'
import { assertNoSeparator } from './core/utils'

/** @internal 从未知值推断列类型 */
function inferColumnType(v: unknown): string {
  if (typeof v === 'number') return 'number'
  if (typeof v === 'boolean') return 'boolean'
  if (v === null) return 'string'
  if (typeof v === 'object') return 'object'
  return 'string'
}

/** @internal 从对象的键推断列配置（fromPageData 内部复用，避免两处重复 Object.keys.map） */
function inferColumnsFromRecord(obj: Record<string, unknown>): DataColumn[] {
  return Object.keys(obj).map(n => ({ name: n, type: inferColumnType(obj[n]), label: n })) as DataColumn[]
}

/**
 * @internal 关系规范化——填充默认值 + 根据 childField/parentField 自动生成 filterExpression
 *
 * 简写模式只需 `{ parentTable, childTable, childField }` 即可：
 * - `dependencyType` 默认 `'currentRow'`
 * - `parentViewId` / `childViewId` 默认 `'default'`
 * - `parentField` 默认取父视图 primaryKey（通常为 `'id'`）
 * - `filterExpression` 由框架根据 childField + parentField 自动生成
 */
function normalizeRelation(r: DataRelation, ds: DataSet): DataRelation {
  const norm = {
    ...r,
    dependencyType: r.dependencyType ?? 'currentRow',
    parentViewId: r.parentViewId ?? 'default',
    childViewId: r.childViewId ?? 'default',
  } as DataRelation

  // 自动生成 filterExpression（简写模式：childField 存在但 filterExpression 缺失）
  if (!norm.filterExpression && norm.childField) {
    // parentField 回退到父视图 primaryKey（与 data-view.ts requestData 逻辑对齐）
    let parentKey = norm.parentField
    if (!parentKey) {
      const parentView = ds.getView(norm.parentTable, norm.parentViewId)
      if (parentView) {
        const pk = parentView.primaryKey
        parentKey = typeof pk === 'string' ? pk : pk[0]
      }
      parentKey = parentKey ?? 'id'
    }
    norm.parentField = parentKey
    norm.filterExpression = {
      field: norm.childField,
      op: '==',
      value: { func: 'FIELD', args: [parentKey] },
    }
  }

  return norm
}

export class DataSet implements IDataSet {

  // ===== 属性定义 =====

  /** 数据集名称 */
  dataSetName: string

  /** 数据表集合 */
  tables: Record<string, DataTable> = {}

  /** 数据关系定义 */
  relations: DataRelation[] | undefined

  /** Schema 格式版本（默认 1） */
  schemaVersion: number

  /** 业务数据版本号（乐观锁） */
  version: number | undefined

  /** 页面ID */
  pageId: string | undefined

  /**
   * M5: 共享 HTTP 客户端——所有 DataTable 的 CrudService 复用同一 Request 实例。
   * 由外部通过 `setSharedHttpClient(client)` 注入。未设置时各 CrudService 各自 createRequest()。
   * @internal
   */
  _sharedHttpClient?: Request | undefined

  // ===== 动态视图订阅追踪 =====

  /**
   * 活跃的 onAnyViewChange 订阅（handler + 每个视图的清理函数）。
   * 当 DataTable.getOrCreateView() 创建新视图时，
   * DataSet._subscribeNewView() 自动为所有活跃订阅追加监听。
   * @internal
   */
  _activeViewSubs: Array<{
    handlers: ViewChangeHandlers
    unsubs: Array<() => void>
  }> = []

  /**
   * 活跃的 on('loadSuccess'|'loadError') 订阅追踪。
   * @internal
   */
  _activeOnSubs: Array<{
    event: 'loadSuccess' | 'loadError'
    handler: (payload: { tableName: string; viewId: string; error?: Error }) => void
    unsubs: Array<() => void>
  }> = []



  // ===== 构造函数 =====

  /**
   * 创建数据集实例
   * @param config 数据集配置
   */
  constructor(config: {
    dataSetName: string
    tables: Record<string, ITableMetadata>
    schemaVersion?: number | undefined
    relations?: DataRelation[] | undefined
    version?: number | undefined
    pageId?: string | undefined
  }) {
    assertNoSeparator(config.dataSetName, 'dataSetName')
    this.dataSetName = config.dataSetName
    this.schemaVersion = config.schemaVersion ?? 1
    this.relations = config.relations
    this.version = config.version
    this.pageId = config.pageId

    // 构建表实例并建立引用链（DataSet → DataTable → DataView）
    this.tables = {}
    const tableDefs = config.tables ?? {}
    for (const [name, td] of Object.entries(tableDefs)) {
      // P1-1: tableName 从对象 key 推断（用户可省略冗余的 tableName 字段）
      if (!td.tableName) {
        (td as { tableName: string }).tableName = name
      }
      const table = DataTable.fromTableData(td)
      table.setDataSet(this)  // 设置 table.dataSet = this, view.dataTable = table
      this.tables[name] = table
    }

    // 关系规范化（浅拷贝 + 默认值填充 + filterExpression 自动生成）
    if (this.relations) {
      this.relations = this.relations.map(r => normalizeRelation(r, this))
    }

    // 后置重算：聚合表达式需要完整 DataSet（所有表 + 规范化关系），
    // 构造过程中各 view 的 set dataTable 只编译了无聚合部分（因为 relations 尚未就绪）。
    // 现在关系已规范化，需要失效缓存 → 重编译（含聚合 resolver）→ 求值。
    for (const table of Object.values(this.tables)) {
      for (const view of Object.values(table.views)) {
        if (view.computedColumnNames.size > 0) {
          // 失效缓存 → 重编译含聚合 resolver → 求值
          view._invalidateCompiledCache()
          view.dataTable = table  // 重编译
          if (view.rows.length > 0) view.recomputeColumns()  // 求值
        }
      }
    }
  }

  // ===== HTTP 客户端共享 =====

  /**
   * 注入共享 HTTP 客户端（M5）——所有 DataTable 的 CrudService 将复用该实例。
   *
   * 调用时机：DataSet 构建完成后、首次数据请求之前。
   * 已创建的 CrudService 实例不受影响（它们保留初始化时的 Request）。
   *
   * @param client  Request 实例（通常由应用层 auth 模块创建，带统一拦截器）
   */
  setSharedHttpClient(client: Request): void {
    this._sharedHttpClient = client
  }

  // ===== 数据集级别事件订阅（页面脚本便捷 API） =====

  /**
   * 订阅数据集级别的加载事件（覆盖所有已注册表的所有视图）
   *
   * - `'loadSuccess'`：任一视图从服务器成功加载数据后触发
   * - `'loadError'`：任一视图加载失败后触发（payload.error 含错误对象）
   *
   * @returns 取消订阅函数（页面卸载时调用以防内存泄漏）
   *
   * @example
   * ```js
   * const off = dataSet.on('loadSuccess', ({ tableName }) => {
   *   ElMessage.success(`${tableName} 加载完成`)
   * })
   * // onUnmounted: off()
   * ```
   */
  on(
    event: 'loadSuccess' | 'loadError',
    handler: (payload: { tableName: string; viewId: string; error?: Error }) => void
  ): () => void {
    const entry: (typeof this._activeOnSubs)[number] = { event, handler, unsubs: [] }
    this._activeOnSubs.push(entry)

    // 订阅当前已存在的所有视图
    for (const table of Object.values(this.tables)) {
      for (const view of Object.values(table.views)) {
        this._subscribeOnView(entry, view)
      }
    }

    return () => {
      for (const u of entry.unsubs) u()
      entry.unsubs.length = 0
      const idx = this._activeOnSubs.indexOf(entry)
      if (idx >= 0) this._activeOnSubs.splice(idx, 1)
    }
  }

  /**
   * 订阅此 DataSet 内任意视图的状态变化（替代全局 event-bus）。
   *
   * 接收 ViewChangeHandlers 映射，按需注册感兴趣的事件类型。
   * 自动追踪：后续通过 getOrCreateView() 动态创建的视图也会被订阅。
   * 作用域严格限定于本实例，不同页面的 DataSet 相互隔离。
   *
   * @example
   * ```ts
   * const off = dataSet.onAnyViewChange({
   *   currentRowChanged(tableName, viewId, currentRow) { ... },
   *   selectedRowsChanged(tableName, viewId, selectedRows) { ... },
   *   cleared(tableName, viewId) { ... },
   * })
   * ```
   */
  onAnyViewChange(handlers: ViewChangeHandlers): () => void {
    const entry: (typeof this._activeViewSubs)[number] = { handlers, unsubs: [] }
    this._activeViewSubs.push(entry)

    // 订阅当前已存在的所有视图
    for (const table of Object.values(this.tables)) {
      for (const view of Object.values(table.views)) {
        this._subscribeViewChange(entry, view)
      }
    }

    return () => {
      for (const u of entry.unsubs) u()
      entry.unsubs.length = 0
      const idx = this._activeViewSubs.indexOf(entry)
      if (idx >= 0) this._activeViewSubs.splice(idx, 1)
    }
  }

  // ===== 动态视图订阅内部方法 =====

  /** @internal 为单个视图订阅独立事件（onAnyViewChange 用） */
  private _subscribeViewChange(
    entry: (typeof this._activeViewSubs)[number],
    view: import('./data-view').DataView,
  ): void {
    const tn = view.tableName
    const vid = view.viewId
    const h = entry.handlers

    // 数据驱动注册：每种事件统一 wrap (tableName, viewId, ...args)
    const eventKeys = [
      'currentRowChanged', 'selectedRowsChanged', 'rowsChanged',
      'cleared', 'requestStateChanged', 'mutatingChanged',
    ] as const
    for (const key of eventKeys) {
      const handler = h[key]
      if (!handler) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fn = (...args: any[]) => (handler as (...a: any[]) => void)(tn, vid, ...args)
      view.events.on(key, fn)
      entry.unsubs.push(() => view.events.off(key, fn))
    }
  }

  /** @internal 为单个视图订阅 loadSuccess/loadError（on() 用） */
  private _subscribeOnView(
    entry: (typeof this._activeOnSubs)[number],
    view: import('./data-view').DataView,
  ): void {
    const h = (requestState: import('./types').RequestState) => {
      if (entry.event === 'loadSuccess' && requestState === RequestState.Loaded) {
        entry.handler({ tableName: view.tableName, viewId: view.viewId })
      } else if (entry.event === 'loadError'
        && requestState === RequestState.Failed
        && view.loadingError !== null) {
        entry.handler({ tableName: view.tableName, viewId: view.viewId, error: view.loadingError })
      }
    }
    view.events.on('requestStateChanged', h)
    entry.unsubs.push(() => view.events.off('requestStateChanged', h))
  }

  /**
   * 将动态创建的视图注册到所有活跃订阅中。
   * 由 DataTable.getOrCreateView() 在创建新视图时调用。
   * @internal
   */
  _subscribeNewView(view: import('./data-view').DataView): void {
    for (const entry of this._activeViewSubs) {
      this._subscribeViewChange(entry, view)
    }
    for (const entry of this._activeOnSubs) {
      this._subscribeOnView(entry, view)
    }
  }

  /**
   * 触发所有标记了 `autoLoad: true` 的 default 视图自动加载。
   *
   * 渲染层（如 usePageDataSet）在构建 DataSet 后调用此方法；
   * 业务脚本不再需要在 `__init__` 中手动写 `view.loadFromServer()`。
   *
   * 仅处理 default 视图——命名视图和从表通常由级联机制驱动。
   */
  triggerAutoLoad(): void {
    for (const table of Object.values(this.tables)) {
      const defaultView = table.getView('default')
      if (defaultView?.autoLoad && defaultView.requestState === RequestState.Idle) {
        void defaultView.requestData()
      }
    }
  }

  // ===== 关系图查询（网状关系，非树形） =====

  /**
   * 查询以指定视图为父的子关系
   * @param parentTable 父表名
   * @param parentViewId 父视图ID
   */
  getChildRelations(parentTable: string, parentViewId: string): DataRelation[] {
    return (this.relations ?? []).filter(
      r => r.parentTable === parentTable && (r.parentViewId ?? 'default') === parentViewId
    )
  }

  /**
   * 查询以指定视图为子的父关系（在网状关系图中向上查找）
   * @param childTable 子表名
   * @param childViewId 子视图ID
   */
  getParentRelations(childTable: string, childViewId: string): DataRelation[] {
    return (this.relations ?? []).filter(
      r => r.childTable === childTable && (r.childViewId ?? 'default') === childViewId
    )
  }

  // ===== 工厂方法 =====

  /**
   * 从配置创建数据集实例
   * @param config 数据集配置
   * @returns 数据集实例
   */
  static fromConfig(config: {
    dataSetName: string
    tables: Record<string, {
      tableName?: string
      columns: DataColumn[]
      rows?: IDataRow[]
      api?: CrudApi | string | boolean
      autoCurrentFirst?: boolean
      autoSelectFirst?: boolean
      selectionFollowsCurrent?: boolean
      views?: Record<string, IViewMetadata>
    }>
    relations?: DataRelation[]
  }): DataSet {
    const tables: Record<string, ITableMetadata> = {}

    for (const [key, tableConfig] of Object.entries(config.tables)) {
      tables[key] = { ...tableConfig, tableName: tableConfig.tableName ?? key } as ITableMetadata
    }

    return new DataSet({
      dataSetName: config.dataSetName,
      tables,
      relations: config.relations,
    })
  }

  // ===== 数据访问 =====

  /**
   * 获取数据表
   * @param name 表名
   * @returns 数据表实例
   */
  getTable(name: string): DataTable | undefined {
    return this.tables[name]
  }

  /**
   * 获取已存在的数据视图（不会创建新视图）
   */
  getView(tableName: string, viewId = 'default'): SparkDataView | undefined {
    const t = this.getTable(tableName)
    if (!t) return undefined
    return t.getView(viewId)
  }

  // ===== 序列化 =====

  /**
   * 序列化为元数据对象
   * @returns 数据集元数据
   */
  toData(): IDataSetMetadata {
    const tables: Record<string, ITableMetadata> = {}
    for (const [n, t] of Object.entries(this.tables)) {
      tables[n] = t.toData()
    }
    return {
      schemaVersion: this.schemaVersion,
      dataSetName: this.dataSetName,
      tables,
      relations: this.relations,
      version: this.version,
      pageId: this.pageId
    } as IDataSetMetadata
  }

  /**
   * 序列化为可 JSON 化的对象（供 JSON.stringify 自动调用）
   * @returns 数据集配置对象
   */
  toJSON(): IDataSetMetadata {
    return this.toData()
  }

  // ===== 反序列化工厂方法 =====

  /**
   * 从元数据创建数据集实例
   * @param data 数据集元数据
   * @returns 数据集实例
   */
  static fromData(data: IDataSetMetadata): DataSet {
    return new DataSet(data)
  }

  /**
   * 从JSON字符串创建数据集实例
   * @param json JSON字符串
   * @returns 数据集实例
   */
  static fromJSON(json: string): DataSet {
    return DataSet.fromData(JSON.parse(json) as IDataSetMetadata)
  }

  /**
   * 从 pagedata.json 原始对象归一化并构建 DataSet 实例
   *
   * 支持两种格式：
   * 1. 标准 DataSet 配置（含 `dataset.tables` 字段）→ 直接使用该子结构
   * 2. 任意 key-value 结构 → 每个 key 归一化为一张表（数组/对象/基础类型）
   *
   * @param rawPageData pagedata.json 原始对象
   * @returns 归一化后的 DataSet 实例
   */
  static fromPageData(rawPageData: Record<string, unknown>): DataSet {
    // 情形 1：rawPageData.dataset.tables 存在 → 标准 DataSet 配置，直接透传
    const datasetCandidate = rawPageData['dataset']
    if (
      datasetCandidate &&
      typeof datasetCandidate === 'object' &&
      'tables' in (datasetCandidate as Record<string, unknown>)
    ) {
      const rd = datasetCandidate as {
        dataSetName?: string
        tables?: Record<string, { 
          tableName: string
          columns: DataColumn[]
          rows?: IDataRow[]
          api?: CrudApi
          views?: Record<string, IViewMetadata>  // ✅ 支持 views 配置
        }>
        relations?: DataRelation[]
      }
      return DataSet.fromConfig({
        dataSetName: rd.dataSetName ?? 'PageDataSet',
        tables: rd.tables ?? {},
        ...(rd.relations ? { relations: rd.relations } : {}),
      })
    }

    // 情形 2：将整个 pagedata 的每个 key 归一化为一张表
    const tables: Record<string, { tableName: string; columns: DataColumn[]; rows: IDataRow[] }> = {}

    for (const [key, val] of Object.entries(rawPageData)) {
      if (key === 'dataset') continue

      // 数组 → 表格行
      if (Array.isArray(val)) {
        const rows: IDataRow[] = []
        let columns: DataColumn[] = []

        if (val.length === 0) {
          columns = []
        } else if (typeof val[0] === 'object' && val[0] !== null && !Array.isArray(val[0])) {
          // 对象数组：以第一个元素的键推断列
          const sample = val[0] as Record<string, unknown>
          columns = inferColumnsFromRecord(sample)
          for (const r of val) rows.push(r as IDataRow)
        } else {
          // 基础类型数组：单列 value
          columns = [{ name: 'value', type: inferColumnType(val[0]), label: 'value' }]
          for (const r of val) rows.push({ value: r } as IDataRow)
        }

        tables[key] = { tableName: key, columns, rows }
        continue
      }

      // 对象 → 单行表
      if (val && typeof val === 'object') {
        const obj = val as Record<string, unknown>
        const columns = inferColumnsFromRecord(obj)
        const row = obj as IDataRow
        tables[key] = { tableName: key, columns, rows: [row] }
        continue
      }

      // 基础类型 → 单列单行表
      tables[key] = {
        tableName: key,
        columns: [{ name: 'value', type: inferColumnType(val), label: 'value' }],
        rows: [{ value: val } as IDataRow],
      }
    }

    // 构造函数会自动设置单行表的 currentRow
    return DataSet.fromConfig({ dataSetName: 'PageDataSet', tables })
  }
}

