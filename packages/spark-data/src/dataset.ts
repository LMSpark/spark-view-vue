/**
 * DataSet — 数据空间协调器（容器 + 数据管理）
 *
 * 职责：表注册管理查询、关系注册管理查询、数据加载协调
 * 不操作下层：不主动调用 DataView/DataTable 的方法来改变它们的状态
 * 不消费下层：不订阅 DataView 的事件（DataSet 是顶层）
 */

import type { IDataSet, IDataSetMetadata, ITableMetadata, DataRelation, TableRelation, ViewDependency, DependencyType, FilterExpression, IDataRow, DataColumn, ColumnType, ViewChangeHandlers } from './types'
import { RequestState } from './types'
import type { DataView as SparkDataView } from './data-view'
import type { HttpClient } from '@spark-view/spark-utils'
import type { IAppServicesCapability } from '@spark-view/spark-utils'
import {
  commitDataSetHistory,
  getDataSetHistoryEntry,
  listDataSetHistory,
} from './dataset-history'
import type {
  DataSetCommitVersionOptions,
  DataSetHistoryEntry,
  DataSetHistoryListOptions,
  DataSetHistoryScope,
  DataSetHistorySelector,
} from './dataset-history'
import { DataTable } from './data-table'
import { normalizeDataSetMetadata } from './metadata'
import { assertNoSeparator } from './core/utils'

/** @internal 从未知值推断列类型 */
function inferColumnType(v: unknown): ColumnType {
  if (typeof v === 'number') return 'number'
  if (typeof v === 'boolean') return 'boolean'
  if (v === null) return 'string'
  if (typeof v === 'object') return 'object'
  return 'string'
}

/** @internal 从对象的键推断列配置（fromPageData 内部复用，避免两处重复 Object.keys.map） */
function inferColumnsFromRecord(obj: Record<string, unknown>): DataColumn[] {
  return Object.keys(obj).map(n => ({ name: n, type: inferColumnType(obj[n]), label: n }))
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && value !== undefined && typeof value === 'object'
    ? value as Record<string, unknown>
    : null
}

function pickFirstString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        const trimmed = item.trim()
        if (trimmed.length > 0) return trimmed
      }
    }
  }
  return undefined
}

function resolveRouteTemplateParams(routeLike: unknown): {
  tenantId?: string
  projectId?: string
} {
  const routeRecord = asRecord(routeLike)
  const paramsRecord = asRecord(routeRecord?.['params'])
  const queryRecord = asRecord(routeRecord?.['query'])

  const tenantId =
    pickFirstString(paramsRecord?.['tenantId'])
    ?? pickFirstString(paramsRecord?.['tenant'])
    ?? pickFirstString(queryRecord?.['tenantId'])
    ?? pickFirstString(queryRecord?.['tenant'])
  const projectId =
    pickFirstString(paramsRecord?.['projectId'])
    ?? pickFirstString(paramsRecord?.['project'])
    ?? pickFirstString(queryRecord?.['projectId'])
    ?? pickFirstString(queryRecord?.['project'])

  const result: { tenantId?: string; projectId?: string } = {}
  if (tenantId !== undefined) result.tenantId = tenantId
  if (projectId !== undefined) result.projectId = projectId
  return result
}

function buildDataSetHistoryScope(
  dataSet: Pick<DataSet, 'dataSetName' | 'pageId'>,
  options?: Pick<DataSetHistoryListOptions, 'scopeId' | 'namespace'>,
): DataSetHistoryScope {
  return {
    dataSetName: dataSet.dataSetName,
    ...(dataSet.pageId !== undefined ? { pageId: dataSet.pageId } : {}),
    ...(options?.scopeId !== undefined ? { scopeId: options.scopeId } : {}),
    ...(options?.namespace !== undefined ? { namespace: options.namespace } : {}),
  }
}

/**
 * @internal 自动推导视图联动
 *
 * - viewDependencies 未提供（undefined）: 每条 tableRelation 生成默认视图联动
 * - viewDependencies 显式提供（含空数组）: 使用显式列表，未覆盖的 tableRelation 仍自动推导
 * - viewDependencies: []（空数组）: 明确无视图联动
 */
function deriveViewDependencies(
  tableRelations: TableRelation[],
  explicit: ViewDependency[] | undefined,
): ViewDependency[] {
  if (explicit?.length === 0) return []

  const result: ViewDependency[] = explicit ? [...explicit] : []

  // 已显式覆盖的 parentTable+childTable 对
  const covered = new Set<string>()
  for (const vd of result) {
    covered.add(`${vd.parentTable}:${vd.childTable}`)
  }

  // 为未覆盖的 tableRelation 自动推导默认视图联动
  for (const tr of tableRelations) {
    const key = `${tr.parentTable}:${tr.childTable}`
    if (!covered.has(key)) {
      result.push({
        parentTable: tr.parentTable,
        childTable: tr.childTable,
        dependencyType: 'currentRow',
        autoLoad: true,
      })
    }
  }

  return result
}

/**
 * @internal 将 TableRelation + ViewDependency 展开为内部扁平 DataRelation（供 CascadeDelegate / DataView 消费）
 */
function expandRelations(
  tableRelations: TableRelation[],
  viewDependencies: ViewDependency[],
  ds: DataSet,
): DataRelation[] {
  // tableRelation 索引：parentTable:childTable → TableRelation
  const trMap = new Map<string, TableRelation>()
  for (const tr of tableRelations) {
    trMap.set(`${tr.parentTable}:${tr.childTable}`, tr)
  }

  return viewDependencies.map(vd => {
    const tr = trMap.get(`${vd.parentTable}:${vd.childTable}`)
    const dependencyType = vd.dependencyType ?? 'currentRow'

    // parentField 回退到父视图 primaryKey（与 data-view.ts requestData 逻辑对齐）
    let parentField = tr?.parentField
    if (!parentField) {
      const parentView = ds.getView(vd.parentTable, 'default')
      if (parentView) {
        parentField = parentView.primaryKey
      }
      parentField = parentField ?? 'id'
    }

    const childField = tr?.childField

    // 自动生成 filterExpression
    let filterExpression: FilterExpression | undefined
    if (childField) {
      filterExpression = {
        field: childField,
        op: '==',
        value: { func: 'FIELD', args: [parentField] },
      }
    }

    return {
      parentTable: vd.parentTable,
      childTable: vd.childTable,
      parentViewId: 'default',
      childViewId: 'default',
      parentField,
      childField,
      dependencyType,
      filterExpression,
      autoLoad: vd.autoLoad,
      cascadeUpdate: tr?.cascadeUpdate,
      cascadeDelete: tr?.cascadeDelete,
      relationName: tr?.relationName,
    } as DataRelation
  })
}

export class DataSet implements IDataSet {

  // ===== 属性定义 =====

  /** 数据集名称 */
  dataSetName: string

  /** 数据表集合 */
  tables: Record<string, DataTable> = {}

  /** L1: 表关系定义 */
  tableRelations: TableRelation[] | undefined

  /** L2: 视图联动定义 */
  viewDependencies: ViewDependency[] | undefined

  /**
   * @internal 展开后的内部扁平关系（TableRelation + ViewDependency 合并）。
   * CascadeDelegate / DataView / ComputedColumnDelegate 消费此结构。
   */
  _resolvedRelations: DataRelation[] | undefined

  /** Schema 格式版本（默认 1） */
  schemaVersion = 2

  /** 业务数据版本号（乐观锁） */
  version: number | undefined

  /** 页面ID */
  pageId: string | undefined

  /**
    * M5: 共享 HTTP 客户端——所有 DataTable 的 CrudService 复用同一 HttpClient 实例。
   * 由外部通过 `setSharedHttpClient(client)` 注入。未设置时各 CrudService 各自 createRequest()。
   * @internal
   */
    _sharedHttpClient?: HttpClient | undefined

  /** @internal 应用能力上下文（用于 URL 模板 tenant/project 占位参数解析） */
  _appServices?: IAppServicesCapability | undefined

  /** @internal 页面路由快照（APP_SERVICES 缺失时的作用域兜底） */
  _pageRoute?: unknown

  /** @internal 关系索引（视图级）：parentTable:parentViewId → children relations */
  private _childRelIdx = new Map<string, DataRelation[]>()
  /** @internal 关系索引（视图级）：childTable:childViewId → parent relations */
  private _parentRelIdx = new Map<string, DataRelation[]>()

  /** @internal 关系索引（表级）：parentTable → TableRelation[]（聚合函数消费） */
  private _tableChildIdx = new Map<string, TableRelation[]>()
  /** @internal 关系索引（表级）：childTable → TableRelation[]  */
  private _tableParentIdx = new Map<string, TableRelation[]>()

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
    tableRelations?: TableRelation[] | undefined
    viewDependencies?: ViewDependency[] | undefined
    version?: number | undefined
    pageId?: string | undefined
  }) {
    assertNoSeparator(config.dataSetName, 'dataSetName')
    this.dataSetName = config.dataSetName
    this._applyNormalizedMetadata({
      dataSetName: config.dataSetName,
      tables: config.tables,
      schemaVersion: config.schemaVersion ?? 2,
      ...(config.tableRelations !== undefined ? { tableRelations: config.tableRelations } : {}),
      ...(config.viewDependencies !== undefined ? { viewDependencies: config.viewDependencies } : {}),
      version: config.version,
      pageId: config.pageId,
    })
  }

  /**
   * 对所有表的 default 视图触发 autoCurrentFirst / autoSelectFirst 初始选中逻辑。
   *
   * 必须在页面脚本（__init__）完成事件订阅**之后**调用，确保订阅者能收到
   * `currentRowChanged` 事件。渲染层在组件 mounted 钩子中、
   * `__init__` 执行完毕后调用此方法。
   */
  initAutoSelection(): void {
    for (const table of Object.values(this.tables)) {
      for (const view of Object.values(table.views)) {
        view.initAutoSelection()
      }
    }
  }

  // ===== HTTP 客户端共享 =====

  /**
   * 注入共享 HTTP 客户端（M5）——所有 DataTable 的 CrudService 将复用该实例。
   *
   * 调用时机：DataSet 构建完成后、首次数据请求之前。
  * 已创建的 CrudService 实例不受影响（它们保留初始化时的 HttpClient）。
   *
   * @param client  HttpClient 实例（通常由应用层 auth 模块创建，带统一拦截器）
   */
  setSharedHttpClient(client: HttpClient): void {
    this._sharedHttpClient = client
  }

  setAppServices(appServices: IAppServicesCapability): void {
    this._appServices = appServices
  }

  setPageRoute(route: unknown): void {
    this._pageRoute = route
  }

  getRequestTemplateParams(): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    const appServices = this._appServices
    const tenantFromService = pickFirstString(appServices?.tenant?.tenantId)
    if (tenantFromService !== undefined) result['tenantId'] = tenantFromService

    const routeFromServices = resolveRouteTemplateParams(appServices?.router?.currentRoute)
    const routeFromPage = resolveRouteTemplateParams(this._pageRoute)

    const tenantFromRoute = routeFromServices.tenantId ?? routeFromPage.tenantId
    const projectFromRoute = routeFromServices.projectId ?? routeFromPage.projectId

    if (tenantFromRoute !== undefined) result['tenantId'] = tenantFromRoute
    if (projectFromRoute !== undefined) result['projectId'] = projectFromRoute
    return result
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
   * // 资源释放时: off()
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
      table.forEachView(view => this._subscribeOnView(entry, view))
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
      table.forEachView(view => this._subscribeViewChange(entry, view))
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
    view: SparkDataView,
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
      const fn = (...args: unknown[]) => (handler as (...a: unknown[]) => void)(tn, vid, ...args)
      view.events.on(key, fn)
      entry.unsubs.push(() => view.events.off(key, fn))
    }
  }

  /** @internal 为单个视图订阅 loadSuccess/loadError（on() 用） */
  private _subscribeOnView(
    entry: (typeof this._activeOnSubs)[number],
    view: SparkDataView,
  ): void {
    const h = (requestState: RequestState) => {
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
  _subscribeNewView(view: SparkDataView): void {
    for (const entry of this._activeViewSubs) {
      this._subscribeViewChange(entry, view)
    }
    for (const entry of this._activeOnSubs) {
      this._subscribeOnView(entry, view)
    }
  }

  /** @internal 在结构变化后重绑所有活跃订阅，避免悬空闭包持有已删除视图。 */
  private _rebindActiveSubscriptions(): void {
    for (const entry of this._activeViewSubs) {
      for (const u of entry.unsubs) u()
      entry.unsubs.length = 0
      for (const table of Object.values(this.tables)) {
        table.forEachView(view => this._subscribeViewChange(entry, view))
      }
    }

    for (const entry of this._activeOnSubs) {
      for (const u of entry.unsubs) u()
      entry.unsubs.length = 0
      for (const table of Object.values(this.tables)) {
        table.forEachView(view => this._subscribeOnView(entry, view))
      }
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
        defaultView.requestData().catch((err: unknown) => {
          if (import.meta.env.DEV) {
            console.warn(`[DataSet] autoLoad 请求失败: ${table.tableName}`, err)
          }
        })
      }
    }
  }

  // ===== 关系图查询（网状关系，非树形） =====

  /**
   * 查询以指定视图为父的子关系（视图级索引）
   * @param parentTable 父表名
   * @param parentViewId 父视图ID
   */
  getChildRelations(parentTable: string, parentViewId: string): DataRelation[] {
    return this._childRelIdx.get(`${parentTable}:${parentViewId}`) ?? []
  }

  /**
   * 查询以指定视图为子的父关系（视图级索引）
   * @param childTable 子表名
   * @param childViewId 子视图ID
   */
  getParentRelations(childTable: string, childViewId: string): DataRelation[] {
    return this._parentRelIdx.get(`${childTable}:${childViewId}`) ?? []
  }

  /**
   * 查询以指定表为父的所有表关系（表级索引，聚合函数消费）
   */
  getTableChildRelations(parentTable: string): TableRelation[] {
    return this._tableChildIdx.get(parentTable) ?? []
  }

  /**
   * 查询以指定表为子的所有表关系（表级索引）
   */
  getTableParentRelations(childTable: string): TableRelation[] {
    return this._tableParentIdx.get(childTable) ?? []
  }

  /** @internal 构建视图级关系双向索引（从 _resolvedRelations） */
  private _buildViewRelationIndex(): void {
    this._childRelIdx.clear()
    this._parentRelIdx.clear()
    for (const r of this._resolvedRelations ?? []) {
      const pKey = `${r.parentTable}:${r.parentViewId ?? 'default'}`
      const cKey = `${r.childTable}:${r.childViewId ?? 'default'}`
      let pArr = this._childRelIdx.get(pKey)
      if (!pArr) { pArr = []; this._childRelIdx.set(pKey, pArr) }
      pArr.push(r)
      let cArr = this._parentRelIdx.get(cKey)
      if (!cArr) { cArr = []; this._parentRelIdx.set(cKey, cArr) }
      cArr.push(r)
    }
  }

  /** @internal 构建表级关系双向索引（从 tableRelations） */
  private _buildTableRelationIndex(): void {
    this._tableChildIdx.clear()
    this._tableParentIdx.clear()
    for (const tr of this.tableRelations ?? []) {
      let pArr = this._tableChildIdx.get(tr.parentTable)
      if (!pArr) { pArr = []; this._tableChildIdx.set(tr.parentTable, pArr) }
      pArr.push(tr)
      let cArr = this._tableParentIdx.get(tr.childTable)
      if (!cArr) { cArr = []; this._tableParentIdx.set(tr.childTable, cArr) }
      cArr.push(tr)
    }
  }

  /** @internal 重建运行时关系图与索引，并通知各视图刷新级联订阅/聚合解析。 */
  private _rebuildRelations(deriveDependencies: boolean): void {
    if (deriveDependencies) {
      this.viewDependencies = this.tableRelations?.length
        ? deriveViewDependencies(this.tableRelations, this.viewDependencies)
        : undefined
    }

    this._buildTableRelationIndex()

    if (this.tableRelations?.length && this.viewDependencies?.length) {
      this._resolvedRelations = expandRelations(this.tableRelations, this.viewDependencies, this)
      this._buildViewRelationIndex()
    } else {
      this._resolvedRelations = undefined
      this._childRelIdx.clear()
      this._parentRelIdx.clear()
    }

    for (const table of Object.values(this.tables)) {
      table.onDataSetRelationsReady()
    }
  }

  private _createTablesFromMetadata(tableDefs: Record<string, ITableMetadata>): void {
    this.tables = {}
    for (const [name, td] of Object.entries(tableDefs)) {
      if (!td.tableName) {
        ;(td as { tableName: string }).tableName = name
      }
      const table = DataTable.fromTableData(td)
      table.setDataSet(this)
      this.tables[name] = table
    }
  }

  private _applyNormalizedMetadata(normalized: IDataSetMetadata): void {
    this.dataSetName = normalized.dataSetName
    this.schemaVersion = normalized.schemaVersion ?? 2
    this.tableRelations = normalized.tableRelations
    this.viewDependencies = normalized.viewDependencies
    this.version = normalized.version
    this.pageId = normalized.pageId
    this._buildTableRelationIndex()
    this._createTablesFromMetadata(normalized.tables)
    this._rebuildRelations(true)
  }

  // ===== 工厂方法 =====

  /**
   * 从配置创建数据集实例
   * @param config 数据集配置
   * @returns 数据集实例
   */
  static fromConfig(config: {
    dataSetName: string
    tables: Record<string, Omit<ITableMetadata, 'tableName'> & { tableName?: string }>
    tableRelations?: TableRelation[]
    viewDependencies?: ViewDependency[]
    schemaVersion?: number
    version?: number
    pageId?: string
  }): DataSet {
    return DataSet.fromData({
      dataSetName: config.dataSetName,
      tables: Object.fromEntries(
        Object.entries(config.tables).map(([tableName, table]) => [
          tableName,
          { ...table, tableName: table.tableName ?? tableName },
        ]),
      ) as Record<string, ITableMetadata>,
      ...(config.schemaVersion !== undefined ? { schemaVersion: config.schemaVersion } : {}),
      ...(config.tableRelations !== undefined ? { tableRelations: config.tableRelations } : {}),
      ...(config.viewDependencies !== undefined ? { viewDependencies: config.viewDependencies } : {}),
      version: config.version,
      pageId: config.pageId,
    })
  }

  replaceFromData(data: IDataSetMetadata): void {
    const normalized = normalizeDataSetMetadata(data)

    for (const table of Object.values(this.tables)) {
      table.destroy()
      table.dataSet = undefined
    }

    this._applyNormalizedMetadata(normalized)
    this._rebindActiveSubscriptions()
  }

  replaceFromPageData(rawPageData: Record<string, unknown>): void {
    const next = DataSet.fromPageData(rawPageData)
    this.replaceFromData(next.toData())
  }

  listVersions(options?: DataSetHistoryListOptions): DataSetHistoryEntry[] {
    return listDataSetHistory(buildDataSetHistoryScope(this, options), options)
  }

  getVersionEntry(selector: DataSetHistorySelector, options?: DataSetHistoryListOptions): DataSetHistoryEntry | null {
    return getDataSetHistoryEntry(buildDataSetHistoryScope(this, options), selector, options)
  }

  commitVersion(options?: DataSetCommitVersionOptions): DataSetHistoryEntry {
    const latestHistoryVersion = this.listVersions(options)[0]?.version ?? 0
    const timestamp = options?.timestamp ?? Date.now()
    const nextVersion = options?.bumpVersion === false
      ? Math.max(this.version ?? 0, latestHistoryVersion)
      : Math.max(this.version ?? 0, latestHistoryVersion) + 1

    this.version = nextVersion

    const committed = commitDataSetHistory(this, {
      ...options,
      dataSetName: this.dataSetName,
      ...(options?.pageId !== undefined
        ? { pageId: options.pageId }
        : this.pageId !== undefined
          ? { pageId: this.pageId }
          : {}),
      version: nextVersion,
      timestamp,
    })

    if (committed) {
      return committed
    }

    return {
      id: `${nextVersion}-${timestamp}`,
      version: nextVersion,
      timestamp,
      dataSetName: this.dataSetName,
      ...(this.pageId !== undefined ? { pageId: this.pageId } : {}),
      ...(options?.label ? { label: options.label } : {}),
      ...(options?.summary ? { summary: options.summary } : {}),
      snapshot: this.toData(),
      ...(options?.sourceData ? { sourceData: JSON.parse(JSON.stringify(options.sourceData)) as Record<string, unknown> } : {}),
    }
  }

  restoreVersion(selector: DataSetHistorySelector, options?: DataSetHistoryListOptions): DataSetHistoryEntry | null {
    const entry = this.getVersionEntry(selector, options)
    if (!entry) return null
    this.replaceFromData(entry.snapshot)
    this.version = entry.version
    return entry
  }

  // ===== 结构变更 =====

  /**
   * 动态添加一张表（含 default 视图）。
   * @returns 新建的 DataTable 实例
   * @throws 表名已存在时抛 Error
   */
  addTable(tableName: string, columns: DataColumn[]): DataTable {
    if (this.tables[tableName]) {
      throw new Error(`Table "${tableName}" already exists in DataSet "${this.dataSetName}"`)
    }

    const table = new DataTable(tableName, columns)
    this.tables[tableName] = table
    table.setDataSet(this)
    table.forEachView(view => this._subscribeNewView(view))
    return table
  }

  /**
   * 删除未被关系或依赖引用的数据表。
   * fail-fast：若仍被 tableRelation / viewDependency 引用，则拒绝删除。
   */
  removeTable(tableName: string): void {
    const table = this.tables[tableName]
    if (!table) throw new Error(`Table "${tableName}" not found in DataSet "${this.dataSetName}"`)

    const relatedRelation = (this.tableRelations ?? []).find(
      rel => rel.parentTable === tableName || rel.childTable === tableName,
    )
    if (relatedRelation) {
      throw new Error(`Table "${tableName}" is referenced by tableRelation, remove relation first`)
    }

    const relatedDependency = (this.viewDependencies ?? []).find(
      dep => dep.parentTable === tableName || dep.childTable === tableName,
    )
    if (relatedDependency) {
      throw new Error(`Table "${tableName}" is referenced by viewDependency, remove dependency first`)
    }

    table.destroy()
    table.dataSet = undefined
    const { [tableName]: _removed, ...rest } = this.tables
    this.tables = rest
    this._rebindActiveSubscriptions()
  }

  private _resolveRelationIndex(selector: {
    parentTable: string
    childTable: string
    parentField?: string
    childField?: string
  }): number {
    this.tableRelations ??= []
    const matches = this.tableRelations
      .map((relation, index) => ({ relation, index }))
      .filter(({ relation }) => {
        if (relation.parentTable !== selector.parentTable || relation.childTable !== selector.childTable) return false
        if (selector.parentField !== undefined && relation.parentField !== selector.parentField) return false
        if (selector.childField !== undefined && relation.childField !== selector.childField) return false
        return true
      })

    if (matches.length === 0) {
      throw new Error(`Relation ${selector.parentTable}→${selector.childTable} not found`)
    }
    if (matches.length > 1) {
      throw new Error(`Relation ${selector.parentTable}→${selector.childTable} is ambiguous, specify parentField/childField`)
    }
    const match = matches[0]
    if (!match) {
      throw new Error(`Relation ${selector.parentTable}→${selector.childTable} not found`)
    }
    return match.index
  }

  private _normalizeRelationSelector(
    selectorOrParentTable: string | {
      parentTable: string
      childTable: string
      parentField?: string
      childField?: string
    },
    childTable?: string,
  ): {
    parentTable: string
    childTable: string
    parentField?: string
    childField?: string
  } {
    if (typeof selectorOrParentTable === 'string') {
      if (!childTable) throw new Error('childTable is required when removeRelation uses pair signature')
      return { parentTable: selectorOrParentTable, childTable }
    }
    return selectorOrParentTable
  }

  private _resolveDependencyIndex(parentTable: string, childTable: string): number {
    this.viewDependencies ??= []
    const idx = this.viewDependencies.findIndex(
      dep => dep.parentTable === parentTable && dep.childTable === childTable,
    )
    if (idx < 0) throw new Error(`Dependency ${parentTable}→${childTable} not found`)
    return idx
  }

  private _assertRelationField(tableName: string, fieldName: string, role: 'Parent' | 'Child'): void {
    const table = this.getTable(tableName)
    if (!table) throw new Error(`${role} table "${tableName}" not found`)
    if (!table.columns.some(column => column.name === fieldName)) {
      throw new Error(`${role} field "${fieldName}" not found in table "${tableName}"`)
    }
  }

  /**
   * 添加 TableRelation（父子表关系）。
   * @throws 引用的表/字段不存在或关系已重复时抛 Error
   */
  addRelation(params: {
    parentTable: string
    childTable: string
    parentField: string
    childField: string
    relationName?: string
  }): void {
    this.tableRelations ??= []

    const parentTable = this.getTable(params.parentTable)
    const childTable = this.getTable(params.childTable)
    if (!parentTable) throw new Error(`Parent table "${params.parentTable}" not found`)
    if (!childTable) throw new Error(`Child table "${params.childTable}" not found`)

    if (!parentTable.columns.some((c) => c.name === params.parentField)) {
      throw new Error(`Parent field "${params.parentField}" not found in table "${params.parentTable}"`)
    }
    if (!childTable.columns.some((c) => c.name === params.childField)) {
      throw new Error(`Child field "${params.childField}" not found in table "${params.childTable}"`)
    }

    const dup = this.tableRelations.some(
      (r) =>
        r.parentTable === params.parentTable &&
        r.childTable === params.childTable &&
        r.parentField === params.parentField &&
        r.childField === params.childField,
    )
    if (dup) throw new Error(`Relation ${params.parentTable}→${params.childTable} already exists`)

    const relation: TableRelation = {
      parentTable: params.parentTable,
      childTable: params.childTable,
      parentField: params.parentField,
      childField: params.childField,
      ...(params.relationName ? { relationName: params.relationName } : {}),
    }
    this.tableRelations.push(relation)
    this._rebuildRelations(false)
  }

  /**
   * 更新 TableRelation。
   * 若存在多个同 parentTable→childTable 的关系，必须显式指定 parentField/childField 消歧。
   */
  updateRelation(
    selector: {
      parentTable: string
      childTable: string
      parentField?: string
      childField?: string
    },
    updates: Partial<TableRelation>,
  ): TableRelation {
    this.tableRelations ??= []

    const idx = this._resolveRelationIndex(selector)
    const current = this.tableRelations[idx]
    if (!current) {
      throw new Error(`Relation ${selector.parentTable}→${selector.childTable} not found`)
    }
    const nextParentTable = updates.parentTable ?? current.parentTable
    const nextChildTable = updates.childTable ?? current.childTable
    const nextParentField = updates.parentField ?? current.parentField
    const nextChildField = updates.childField ?? current.childField

    if (!nextParentField) {
      throw new Error(`Parent field is required for relation ${current.parentTable}→${current.childTable}`)
    }
    if (!nextChildField) {
      throw new Error(`Child field is required for relation ${current.parentTable}→${current.childTable}`)
    }

    const next: TableRelation = {
      ...current,
      ...updates,
      parentTable: nextParentTable,
      childTable: nextChildTable,
      parentField: nextParentField,
      childField: nextChildField,
    }

    this._assertRelationField(next.parentTable, nextParentField, 'Parent')
    this._assertRelationField(next.childTable, nextChildField, 'Child')

    const pairChanged = next.parentTable !== current.parentTable || next.childTable !== current.childTable
    if (pairChanged) {
      const blocking = (this.viewDependencies ?? []).some(
        dep => dep.parentTable === current.parentTable && dep.childTable === current.childTable,
      )
      if (blocking) {
        throw new Error(`Relation ${current.parentTable}→${current.childTable} is referenced by viewDependency, update dependency first`)
      }
    }

    const duplicate = this.tableRelations.some((relation, relationIndex) => {
      if (relationIndex === idx) return false
      return relation.parentTable === next.parentTable
        && relation.childTable === next.childTable
        && relation.parentField === next.parentField
        && relation.childField === next.childField
    })
    if (duplicate) {
      throw new Error(`Relation ${next.parentTable}→${next.childTable} already exists`)
    }

    this.tableRelations[idx] = next
    this._rebuildRelations(false)
    return next
  }

  /**
   * 删除 TableRelation。
   * @throws 关系不存在或被 viewDependency 引用时抛 Error
   */
  removeRelation(selector: {
    parentTable: string
    childTable: string
    parentField?: string
    childField?: string
  }): void
  removeRelation(parentTable: string, childTable: string): void
  removeRelation(
    selectorOrParentTable: string | {
      parentTable: string
      childTable: string
      parentField?: string
      childField?: string
    },
    childTable?: string,
  ): void {
    this.tableRelations ??= []

    const selector = this._normalizeRelationSelector(selectorOrParentTable, childTable)

    const idx = this._resolveRelationIndex(selector)
    const relation = this.tableRelations[idx]
    if (!relation) {
      throw new Error(`Relation ${selector.parentTable}→${selector.childTable} not found`)
    }

    const blocking = (this.viewDependencies ?? []).some(
      (d) => d.parentTable === relation.parentTable && d.childTable === relation.childTable,
    )
    if (blocking) {
      throw new Error(`Relation ${relation.parentTable}→${relation.childTable} is referenced by viewDependency, remove dependency first`)
    }

    this.tableRelations.splice(idx, 1)
    this._rebuildRelations(false)
  }

  /**
   * 添加 ViewDependency（视图联动依赖）。
   * @throws 表不存在、底层 relation 缺失、或重复时抛 Error
   */
  addDependency(params: {
    parentTable: string
    childTable: string
    dependencyType?: DependencyType | undefined
    autoLoad?: boolean
  }): void {
    if (!this.getTable(params.parentTable)) throw new Error(`Parent table "${params.parentTable}" not found`)
    if (!this.getTable(params.childTable)) throw new Error(`Child table "${params.childTable}" not found`)

    const hasRelation = (this.tableRelations ?? []).some(
      (r) => r.parentTable === params.parentTable && r.childTable === params.childTable,
    )
    if (!hasRelation) {
      throw new Error(`No tableRelation for ${params.parentTable}→${params.childTable}, add relation first`)
    }

    this.viewDependencies ??= []

    const dup = this.viewDependencies.some(
      (d) => d.parentTable === params.parentTable && d.childTable === params.childTable,
    )
    if (dup) throw new Error(`Dependency ${params.parentTable}→${params.childTable} already exists`)

    const dep: ViewDependency = {
      parentTable: params.parentTable,
      childTable: params.childTable,
      dependencyType: params.dependencyType ?? 'currentRow',
      ...(params.autoLoad !== undefined ? { autoLoad: params.autoLoad } : {}),
    }
    this.viewDependencies.push(dep)
    this._rebuildRelations(false)
  }

  /**
   * 更新 ViewDependency。
   * fail-fast：目标 parentTable→childTable 必须已有底层 tableRelation。
   */
  updateDependency(
    parentTable: string,
    childTable: string,
    updates: Partial<ViewDependency>,
  ): ViewDependency {
    this.viewDependencies ??= []

    const idx = this._resolveDependencyIndex(parentTable, childTable)
    const current = this.viewDependencies[idx]
    if (!current) {
      throw new Error(`Dependency ${parentTable}→${childTable} not found`)
    }
    const next: ViewDependency = {
      ...current,
      ...updates,
      parentTable: updates.parentTable ?? current.parentTable,
      childTable: updates.childTable ?? current.childTable,
    }

    if (!this.getTable(next.parentTable)) throw new Error(`Parent table "${next.parentTable}" not found`)
    if (!this.getTable(next.childTable)) throw new Error(`Child table "${next.childTable}" not found`)

    const hasRelation = (this.tableRelations ?? []).some(
      relation => relation.parentTable === next.parentTable && relation.childTable === next.childTable,
    )
    if (!hasRelation) {
      throw new Error(`No tableRelation for ${next.parentTable}→${next.childTable}, update relation first`)
    }

    const duplicate = this.viewDependencies.some((dep, depIndex) => {
      if (depIndex === idx) return false
      return dep.parentTable === next.parentTable && dep.childTable === next.childTable
    })
    if (duplicate) {
      throw new Error(`Dependency ${next.parentTable}→${next.childTable} already exists`)
    }

    this.viewDependencies[idx] = next
    this._rebuildRelations(false)
    return next
  }

  /**
   * 删除 ViewDependency。
   * @throws 依赖不存在时抛 Error
   */
  removeDependency(parentTable: string, childTable: string): void {
    this.viewDependencies ??= []

    const idx = this.viewDependencies.findIndex(
      (d) => d.parentTable === parentTable && d.childTable === childTable,
    )
    if (idx < 0) throw new Error(`Dependency ${parentTable}→${childTable} not found`)

    this.viewDependencies.splice(idx, 1)
    this._rebuildRelations(false)
  }

  // ===== 数据访问 =====

  /**
   * 销毁 DataSet 及其所有 DataTable/DataView 的资源。
   *
   * 调用后：
   * - 所有 `onAnyViewChange` / `on('loadSuccess'|'loadError')` 订阅被清理
   * - 所有 DataView 的 destroy() 被调用（清理级联、CRUD、计算列、脏追踪等委托）
   * - 共享 HTTP 客户端引用被释放
   * - 标记为已销毁，后续操作静默忽略
   *
   * 使用场景：页面卸载时由 `usePageDataSet.clearDataSet()` 调用。
   */
  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true

    // 1. 清理 DataSet 级别的事件订阅
    for (const entry of this._activeViewSubs) {
      for (const u of entry.unsubs) u()
      entry.unsubs.length = 0
    }
    this._activeViewSubs.length = 0

    for (const entry of this._activeOnSubs) {
      for (const u of entry.unsubs) u()
      entry.unsubs.length = 0
    }
    this._activeOnSubs.length = 0

    // 2. 销毁所有 DataTable 下的 DataView
    for (const table of Object.values(this.tables)) {
      table.forEachView(view => view.destroy())
    }

    // 3. 释放共享 HTTP 客户端引用
    this._sharedHttpClient = undefined
    this._appServices = undefined
    this._pageRoute = undefined
  }

  /** @internal 是否已销毁 */
  private _destroyed = false

  /** 数据集是否已被销毁 */
  get destroyed(): boolean {
    return this._destroyed
  }

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
      tableRelations: this.tableRelations,
      viewDependencies: this.viewDependencies,
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
    const normalized = normalizeDataSetMetadata(data)
    return new DataSet(normalized)
  }

  /**
   * 从JSON字符串创建数据集实例
   * @param json JSON字符串
   * @returns 数据集实例
   */
  static fromJSON(json: string): DataSet {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('DataSet.fromJSON: 无效的 JSON 数据')
    }
    return DataSet.fromData(parsed as IDataSetMetadata)
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
      datasetCandidate !== null &&
      datasetCandidate !== undefined &&
      typeof datasetCandidate === 'object' &&
      'tables' in (datasetCandidate as Record<string, unknown>)
    ) {
      const rd = datasetCandidate as {
        dataSetName?: string
        tables?: Record<string, Omit<ITableMetadata, 'tableName'> & { tableName?: string }>
        tableRelations?: TableRelation[]
        viewDependencies?: ViewDependency[]
        schemaVersion?: number
        version?: number
        pageId?: string
      }
      return DataSet.fromConfig({
        dataSetName: rd.dataSetName ?? 'PageDataSet',
        tables: (rd.tables ?? {}) as Record<string, Omit<ITableMetadata, 'tableName'> & { tableName?: string }>,
        ...(rd.tableRelations ? { tableRelations: rd.tableRelations } : {}),
        ...(rd.viewDependencies ? { viewDependencies: rd.viewDependencies } : {}),
        ...(rd.schemaVersion !== undefined ? { schemaVersion: rd.schemaVersion } : {}),
        ...(rd.version !== undefined ? { version: rd.version } : {}),
        ...(rd.pageId !== undefined ? { pageId: rd.pageId } : {}),
      })
    }

    // 情形 2：将整个 pagedata 的每个 key 归一化为一张表
    const tables: Record<string, Omit<ITableMetadata, 'tableName'> & { tableName: string }> = {}

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

        tables[key] = { tableName: key, columns, views: { default: { rows } } }
        continue
      }

      // 对象 → 单行表
      if (val !== null && val !== undefined && typeof val === 'object') {
        const obj = val as Record<string, unknown>
        const columns = inferColumnsFromRecord(obj)
        const row = obj as IDataRow
        tables[key] = { tableName: key, columns, views: { default: { rows: [row] } } }
        continue
      }

      // 基础类型 → 单列单行表
      tables[key] = {
        tableName: key,
        columns: [{ name: 'value', type: inferColumnType(val), label: 'value' }],
        views: { default: { rows: [{ value: val } as IDataRow] } },
      }
    }

    // 构造函数会自动设置单行表的 currentRow
    return DataSet.fromConfig({ dataSetName: 'PageDataSet', tables } as Parameters<typeof DataSet.fromConfig>[0])
  }
}

