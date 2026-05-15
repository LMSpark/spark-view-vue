import { DataSet } from './dataset'
import { SnapshotHistory, deepClone } from '@spark-view/spark-utils'
import type { DataTable } from './data-table'
import type { DataView } from './data-view'
import type {
  AggregateColumnConfig,
  BatchResult,
  CrudApi,
  CrudOperationConfig,
  CrudResult,
  DataColumn,
  IDataSetMetadata,
  IDataRow,
  ITableMetadata,
  IViewMetadata,
  FieldDependency,
  TableRelation,
  ViewDependency,
  TableSemanticMetadata,
  TableResourceType,
  TableBusinessCategory,
} from './types'

/**
 * 创建数据表时的输入参数。
 */
interface DataSetCrudToolCreateTableOptions extends TableSemanticMetadata {
  /**
   * 表名。
   * 在同一个 DataSet 内必须唯一，后续所有表级 CRUD 都以它为入口。
   */
  tableName: string
  /**
   * 初始列定义。
   */
  columns: DataColumn[]
  /**
   * 可选的 CRUD API 配置。
   * 传入后，表及其视图可直接走远端 CRUD 能力。
   */
  api?: CrudApi | string | boolean
  /**
   * 可选的 CRUD 运行配置。
   */
  crudConfig?: CrudOperationConfig
  /**
   * 需要一起创建或初始化的视图配置。
   * 其中 default 视图不会新建，只会复用建表时自动创建的实例并应用配置。
   */
  views?: Record<string, IViewMetadata>
}

/**
 * 更新数据表时的输入参数。
 */
interface DataSetCrudToolUpdateTableOptions {
  /**
   * 需要新增的列。
   * 内部统一走 DataTable.addColumns，保证 validator 与 DataView 列缓存同步刷新。
   */
  columnsToAdd?: DataColumn[]
  /**
   * 需要更新的列定义。
   */
  columnUpdates?: Array<{ columnName: string; updates: Partial<DataColumn> }>
  /**
   * 需要删除的列名列表。
   */
  columnsToRemove?: string[]
  /**
   * 新的 CRUD API 配置。
   */
  api?: CrudApi | string | boolean
  /**
   * 新的 CRUD 运行配置。
   * 传入 null 表示显式移除已有 crudConfig。
   */
  crudConfig?: CrudOperationConfig | null
  /**
   * 新的资源类型。
   * 传入 null 表示显式清空已有 resourceType。
   */
  resourceType?: TableResourceType | null
  /**
   * 新的资源 ID。
   * 传入 null 表示显式清空已有 resourceId。
   */
  resourceId?: string | null
  /**
   * 新的业务分类。
   * 传入 null 表示显式清空已有 businessCategory。
   */
  businessCategory?: TableBusinessCategory | null
  /**
   * default 视图需要替换的整批行数据。
   */
  defaultRows?: IDataRow[]
}

/**
 * 关系选择器。
 *
 * 默认可用 parentTable + childTable 定位；当同一父子表之间存在多条关系时，
 * 需要继续提供 parentField / childField 做字段级消歧。
 */
type RelationSelector = {
  parentTable: string
  childTable: string
  parentField?: string
  childField?: string
}

function replaceViewKeyTable(viewKey: string, tableName: string, newTableName: string): string {
  const parts = viewKey.split('@')
  if (parts.length === 2 && parts[0] === tableName) {
    return `${newTableName}@${parts[1]}`
  }
  if (parts.length === 3 && parts[0]?.startsWith('#') && parts[1] === tableName) {
    return `${parts[0]}@${newTableName}@${parts[2]}`
  }
  return viewKey
}

/**
 * DataSet 级统一 CRUD facade。
 *
 * 设计目标：
 * 1. 构造时只要求 dataSetName，外部无需先手动拼装 DataSet。
 * 2. 统一收口表、列、视图、行、关系、依赖这几类对象的常用操作。
 * 3. 全部复用现有 DataSet/DataTable/DataView 能力，避免再造第二套状态模型。
 * 4. 所有公开方法统一使用单一对象参数，便于 LLM / 动态调度直接传 JSON object。
 */
export class DataSetCrudTool {
  private static readonly HISTORY_LIMIT = 50

  /**
   * 当前工具类持有的 DataSet 实例。
   */
  private _dataSet: DataSet
  private _history!: SnapshotHistory<IDataSetMetadata>

  /**
   * 创建一个绑定到指定 dataSetName 的统一 CRUD 工具。
   *
   * @param dataSetName DataSet 名称。
   */
  constructor(dataSetName: string) {
    // 从最小空配置创建 DataSet，后续对象全部通过本工具类逐步补齐。
    this._dataSet = DataSet.fromJson({
      dataSetName,
      tables: {},
    })
    this.initializeHistory()
  }

  /**
   * 从已有 DataSet 实例创建工具类。
   */
  static fromDataSet(dataSet: DataSet): DataSetCrudTool {
    const tool = Object.create(DataSetCrudTool.prototype) as DataSetCrudTool
    tool._dataSet = dataSet
    tool.initializeHistory()
    return tool
  }

  /**
   * 从 JSON 元数据创建工具类。
   */
  static fromJson(json: IDataSetMetadata | Record<string, unknown> | string): DataSetCrudTool {
    const ds = DataSet.fromJson(json)
    return DataSetCrudTool.fromDataSet(ds)
  }

  /**
   * 以模型层方式合并外部快照。
   * - 无当前工具时：创建新工具（历史从快照初始化）。
   * - preserveHistory=false：重建工具并重置历史。
   * - preserveHistory=true：在当前历史链中提交快照，支持 undo/redo。
   */
  static reconcileFromJson(
    snapshot: IDataSetMetadata | Record<string, unknown> | string,
    current?: DataSetCrudTool,
    options?: { preserveHistory?: boolean },
  ): DataSetCrudTool {
    const normalizedSnapshot = DataSet.fromJson(snapshot).toJson()

    if (!current) {
      return DataSetCrudTool.fromJson(normalizedSnapshot)
    }

    if (options?.preserveHistory === false) {
      current.replaceFromJson(normalizedSnapshot, { commitHistory: false })
      return current
    }

    const currentJson = JSON.stringify(current.toJson())
    const nextJson = JSON.stringify(normalizedSnapshot)
    if (currentJson === nextJson) {
      return current
    }

    current.replaceFromJson(normalizedSnapshot, { commitHistory: true })
    return current
  }

  /**
   * 当前工具类持有的 DataSet 实例。
   */
  get dataSet(): DataSet {
    return this._dataSet
  }

  // ====================
  // DataSet 基础信息
  // ====================

  /**
   * 返回当前工具类绑定的 DataSet 名称。
   *
   * @returns DataSet 名称。
   */
  get dataSetName(): string {
    return this.dataSet.dataSetName
  }

  /**
   * 将当前 DataSet 序列化为元数据对象。
   *
   * @returns 可用于持久化或传输的 DataSet 元数据。
   */
  toJson(): IDataSetMetadata {
    return this.dataSet.toJson()
  }

  // ====================
  // Undo / Redo
  // ====================

  get canUndo(): boolean {
    return this._history.canUndo
  }

  get canRedo(): boolean {
    return this._history.canRedo
  }

  get historyCursor(): number {
    return this._history.cursor
  }

  getCanUndo(): boolean {
    return this.canUndo
  }

  getCanRedo(): boolean {
    return this.canRedo
  }

  getHistoryCursor(): number {
    return this.historyCursor
  }

  /**
   * 撤销最近一次结构写操作。
   * 成功时替换内部 DataSet 并返回 true；无可撤销时返回 false。
   */
  undo(): boolean {
    const snapshot = this._history.undo()
    if (snapshot === null) return false
    this._dataSet.replaceFromJson(snapshot)
    return true
  }

  /**
   * 重做最近一次被撤销的操作。
   * 成功时替换内部 DataSet 并返回 true；无可重做时返回 false。
   */
  redo(): boolean {
    const snapshot = this._history.redo()
    if (snapshot === null) return false
    this._dataSet.replaceFromJson(snapshot)
    return true
  }

  clearHistory(): void {
    const current = this._history.current
    this._history.clear()
    if (current !== null) {
      this._history.push(current)
    }
  }

  /**
   * 用外部快照替换当前 DataSet。
   * 默认会把替换结果压入历史栈，确保该替换可被撤销/重做。
   */
  replaceFromJson(snapshot: IDataSetMetadata | Record<string, unknown> | string, options?: { commitHistory?: boolean }): void {
    const normalizedSnapshot = DataSet.fromJson(snapshot).toJson()
    this._dataSet.replaceFromJson(normalizedSnapshot)
    if (options?.commitHistory === false) {
      this.initializeHistory()
      return
    }
    this._history.push(this._dataSet.toJson())
  }

  /**
   * 每次结构写操作成功后调用，将当前状态推入历史栈。
   */
  private _afterWrite(): void {
    this._history.push(this._dataSet.toJson())
  }

  private initializeHistory(): void {
    this._history = new SnapshotHistory<IDataSetMetadata>(DataSetCrudTool.HISTORY_LIMIT)
    this._history.push(this._dataSet.toJson())
  }

  // ====================
  // 表与列结构 CRUD
  // ====================

  /**
   * 列出当前 DataSet 中的全部数据表。
   *
   * @returns 数据表实例列表。
   */
  listTables(): DataTable[] {
    return Object.values(this.dataSet.tables)
  }

  /**
   * 获取指定数据表。
   *
   * @param tableName 表名。
   * @returns 命中的 DataTable；不存在时返回 undefined。
   */
  getTable(tableNameOrParams: string | { tableName: string }): DataTable | undefined {
    return this.dataSet.getTable(this.normalizeTableNameArg(tableNameOrParams, 'getTable'))
  }

  /**
   * 列出指定数据表的全部列定义。
   *
   * @param tableName 表名。
   * @returns 列定义副本列表。
   * @throws 当表不存在时抛错。
   */
  listColumns(tableNameOrParams: string | { tableName: string }): DataColumn[] {
    return [...this.getTableOrThrow(this.normalizeTableNameArg(tableNameOrParams, 'listColumns')).columns]
  }

  /**
   * 获取指定数据表中的单个列定义。
   *
   * @param tableName 表名。
   * @param columnName 列名。
   * @returns 命中的列定义；不存在时返回 undefined。
   * @throws 当表不存在时抛错。
   */
  getColumn(params: { tableName: string; columnName: string }): DataColumn | undefined {
    const tableName = this.requireNonEmptyString(params.tableName, 'getColumn.tableName')
    const columnName = this.requireNonEmptyString(params.columnName, 'getColumn.columnName')
    return this.getTableOrThrow(tableName).columns.find(column => column.name === columnName)
  }

  /**
   * 向指定数据表追加一列。
   *
   * @param tableName 表名。
   * @param column 新列定义。
   * @returns 更新后的 DataTable。
   * @throws 当表不存在或列定义非法时抛错。
   */
  createColumn(params: { tableName: string; column: DataColumn }): DataTable {
    const tableName = this.requireNonEmptyString(params.tableName, 'createColumn.tableName')
    const column = this.requireObjectArg(params.column, 'createColumn.column')
    const table = this.getTableOrThrow(tableName)
    // 必须走 DataTable.addColumns，不能直接改 metadata，否则 validator / view 列缓存会失效。
    table.addColumns([column])
    this._afterWrite()
    return table
  }

  /**
   * 更新指定列定义。
   *
   * @param tableName 表名。
   * @param columnName 列名。
   * @param updates 需要合并到现有列定义中的更新内容。
   * @returns 更新后的 DataTable。
   * @throws 当表或列不存在时抛错。
   */
  updateColumn(params: { tableName: string; columnName: string; updates: Partial<DataColumn> }): DataTable {
    const tableName = this.requireNonEmptyString(params.tableName, 'updateColumn.tableName')
    const columnName = this.requireNonEmptyString(params.columnName, 'updateColumn.columnName')
    const updates = this.requireObjectArg(params.updates, 'updateColumn.updates')
    const table = this.getTableOrThrow(tableName)
    // 列更新后会触发 DataTable 内部运行时刷新链，保证 DataView.getColumn 与 schema 保持一致。
    table.updateColumn(columnName, updates)
    this._afterWrite()
    return table
  }

  renameColumn(params: { tableName: string; columnName: string; newColumnName: string }): DataTable {
    const tableName = params.tableName.trim()
    const columnName = params.columnName.trim()
    const newColumnName = params.newColumnName.trim()

    if (!tableName) throw new Error('renameColumn: tableName 不能为空')
    if (!columnName) throw new Error('renameColumn: columnName 不能为空')
    if (!newColumnName) throw new Error('renameColumn: newColumnName 不能为空')
    if (columnName === newColumnName) return this.getTableOrThrow(tableName)

    const snapshot = deepClone(this.toJson())
    const table = snapshot.tables[tableName]
    if (!table) throw new Error(`renameColumn: table ${tableName} 不存在`)
    if (table.columns.some((column) => column.name === newColumnName)) {
      throw new Error(`renameColumn: 列 ${newColumnName} 已存在于表 ${tableName}`)
    }

    const column = table.columns.find((entry) => entry.name === columnName)
    if (!column) throw new Error(`renameColumn: column ${columnName} 不存在于表 ${tableName}`)
    column.name = newColumnName

    const renameRowField = (row: Record<string, unknown>): Record<string, unknown> => {
      if (!Object.prototype.hasOwnProperty.call(row, columnName)) return row
      const nextRow: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(row)) {
        nextRow[key === columnName ? newColumnName : key] = value
      }
      return nextRow
    }

    const renameFieldRefs = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        return value.map(item => renameFieldRefs(item))
      }
      if (value === null || value === undefined || typeof value !== 'object') {
        return value
      }

      const record = value as Record<string, unknown>
      const nextRecord: Record<string, unknown> = {}
      for (const [key, child] of Object.entries(record)) {
        if (key === 'field' && child === columnName) {
          nextRecord[key] = newColumnName
          continue
        }
        if (key === 'valueField') {
          if (child === columnName) {
            nextRecord[key] = newColumnName
            continue
          }
          if (Array.isArray(child)) {
            nextRecord[key] = (child as string[]).map(item => item === columnName ? newColumnName : item)
            continue
          }
        }
        if (key === 'labelField' && child === columnName) {
          nextRecord[key] = newColumnName
          continue
        }
        if ((key === 'sourceField' || key === 'targetField' || key === 'matchField') && child === columnName) {
          nextRecord[key] = newColumnName
          continue
        }
        nextRecord[key] = renameFieldRefs(child)
      }
      return nextRecord
    }

    const renamedViews = Object.fromEntries(
      Object.entries(table.views).map(([viewId, view]) => {
        const nextView = renameFieldRefs(view) as IViewMetadata
        if (Array.isArray(nextView.rows)) {
          nextView.rows = nextView.rows.map(row => renameRowField(row))
        }
        return [viewId, nextView]
      }),
    ) as ITableMetadata['views']
    table.views = renamedViews

    if (snapshot.tableRelations) {
      snapshot.tableRelations = snapshot.tableRelations.map((relation) => ({
        ...relation,
        ...(relation.parentTable === tableName && relation.parentField === columnName ? { parentField: newColumnName } : {}),
        ...(relation.childTable === tableName && relation.childField === columnName ? { childField: newColumnName } : {}),
      }))
    }

    this.replaceFromJson(snapshot, { commitHistory: true })
    return this.getTableOrThrow(tableName)
  }

  /**
   * 删除指定列。
   *
   * @param tableName 表名。
   * @param columnName 列名。
   * @throws 当表或列不存在时抛错。
   */
  deleteColumn(params: { tableName: string; columnName: string }): void {
    const tableName = this.requireNonEmptyString(params.tableName, 'deleteColumn.tableName')
    const columnName = this.requireNonEmptyString(params.columnName, 'deleteColumn.columnName')
    this.getTableOrThrow(tableName).removeColumn(columnName)
    this._afterWrite()
  }

  /**
  * 创建数据表并按需初始化资源语义、API、CRUD 配置和视图。
   *
   * @param options 建表参数。
   * @returns 新创建的数据表实例。
   * @throws 当表已存在或配置非法时抛错。
   */
  createTable(options: DataSetCrudToolCreateTableOptions): DataTable {
    const table = this.dataSet.addTable(options.tableName, options.columns)

    this.applyTableSemanticMetadata(table, options)

    if (options.api !== undefined) {
      table.setApi(options.api)
    }
    if (options.crudConfig !== undefined) {
      table.setCrudConfig(options.crudConfig)
    }

    if (options.views) {
      for (const [viewId, viewConfig] of Object.entries(options.views)) {
        const view = viewId === 'default'
          ? this.getViewOrThrow(options.tableName, 'default')
          : table.addView(viewId)
        this.applyViewMetadata(table, view, viewConfig)
      }
    }

    this._afterWrite()
    return table
  }

  /**
  * 更新数据表结构、资源语义及运行配置。
   *
   * @param tableName 表名。
   * @param updates 更新内容。
   * @returns 更新后的 DataTable。
   * @throws 当表不存在或某项结构更新非法时抛错。
   */
  updateTable(params: { tableName: string } & DataSetCrudToolUpdateTableOptions): DataTable {
    const tableName = this.requireNonEmptyString(params.tableName, 'updateTable.tableName')
    const table = this.getTableOrThrow(tableName)

    // 结构变更优先执行，避免后续 rows / api / crudConfig 更新面对旧 schema。
    if (params.columnsToAdd?.length) {
      table.addColumns(params.columnsToAdd)
    }
    if (params.columnUpdates?.length) {
      for (const entry of params.columnUpdates) {
        table.updateColumn(entry.columnName, entry.updates)
      }
    }
    if (params.columnsToRemove?.length) {
      for (const columnName of params.columnsToRemove) {
        table.removeColumn(columnName)
      }
    }
    if (params.api !== undefined) {
      table.setApi(params.api)
    }
    if (params.crudConfig !== undefined) {
      if (params.crudConfig === null) {
        delete table.crudConfig
      } else {
        table.setCrudConfig(params.crudConfig)
      }
    }
    this.applyTableSemanticMetadata(table, params, true)
    if (params.defaultRows !== undefined) {
      table.rows = [...params.defaultRows]
      table.getView('default')?.replaceRows([...params.defaultRows])
    }

    this._afterWrite()
    return table
  }

  renameTable(params: { tableName: string; newTableName: string }): DataTable {
    const tableName = params.tableName.trim()
    const newTableName = params.newTableName.trim()

    if (!tableName) throw new Error('renameTable: tableName 不能为空')
    if (!newTableName) throw new Error('renameTable: newTableName 不能为空')
    if (tableName === newTableName) return this.getTableOrThrow(tableName)

    const snapshot = deepClone(this.toJson())
    const table = snapshot.tables[tableName]
    if (!table) throw new Error(`renameTable: table ${tableName} 不存在`)
    if (snapshot.tables[newTableName]) {
      throw new Error(`renameTable: table ${newTableName} 已存在`)
    }

    const nextTables: Record<string, ITableMetadata> = {}
    for (const [key, value] of Object.entries(snapshot.tables)) {
      if (key !== tableName) {
        nextTables[key] = value
        continue
      }

      nextTables[newTableName] = {
        ...value,
        tableName: newTableName,
        views: Object.fromEntries(
          Object.entries(value.views).map(([viewId, view]) => [viewId, { ...view, tableName: newTableName }]),
        ) as ITableMetadata['views'],
      }
    }
    snapshot.tables = nextTables

    if (snapshot.tableRelations) {
      snapshot.tableRelations = snapshot.tableRelations.map((relation) => ({
        ...relation,
        ...(relation.parentTable === tableName ? { parentTable: newTableName } : {}),
        ...(relation.childTable === tableName ? { childTable: newTableName } : {}),
      }))
    }

    if (snapshot.viewDependencies) {
      snapshot.viewDependencies = snapshot.viewDependencies.map((dependency) => ({
        ...dependency,
        targetViewKey: replaceViewKeyTable(dependency.targetViewKey, tableName, newTableName),
        sources: dependency.sources.map(source => ({
          ...source,
          viewKey: replaceViewKeyTable(source.viewKey, tableName, newTableName),
        })),
      }))
    }

    const currentTablePositions = snapshot.layout?.tablePositions
    const nextLayoutEntry = currentTablePositions?.[tableName]
    if (nextLayoutEntry !== undefined && currentTablePositions !== undefined) {
      const { [tableName]: _removedLayoutEntry, ...rest } = currentTablePositions
      snapshot.layout = {
        tablePositions: {
          ...rest,
          [newTableName]: nextLayoutEntry,
        },
      }
    }

    this.replaceFromJson(snapshot, { commitHistory: true })
    return this.getTableOrThrow(newTableName)
  }

  /**
   * 删除指定数据表。
   *
   * @param tableName 表名。
   * @throws 当表不存在，或仍被 relation / dependency 引用时抛错。
   */
  deleteTable(tableNameOrParams: string | { tableName: string }): void {
    this.dataSet.removeTable(this.normalizeTableNameArg(tableNameOrParams, 'deleteTable'))
    this._afterWrite()
  }

  // ====================
  // 视图 CRUD
  // ====================

  /**
   * 列出某个数据表下的全部视图。
   *
   * @param tableName 表名。
   * @returns 视图实例列表。
   * @throws 当表不存在时抛错。
   */
  listViews(tableNameOrParams: string | { tableName: string }): DataView[] {
    return Object.values(this.getTableOrThrow(this.normalizeTableNameArg(tableNameOrParams, 'listViews')).views)
  }

  /**
   * 获取指定视图。
   *
   * @param tableName 表名。
   * @param viewId 视图 ID，默认 default。
   * @returns 视图实例；不存在时返回 undefined。
   */
  getView(params: { tableName: string; viewId?: string }): DataView | undefined {
    const tableName = this.requireNonEmptyString(params.tableName, 'getView.tableName')
    return this.dataSet.getView(tableName, params.viewId ?? 'default')
  }

  /**
   * 创建一个非 default 视图。
   *
   * @param tableName 表名。
   * @param viewId 视图 ID。
   * @param config 视图初始配置。
   * @returns 新创建的视图实例。
   * @throws 当表不存在，或试图创建 default 视图时抛错。
   */
  createView(params: { tableName: string; viewId: string; config?: IViewMetadata }): DataView {
    const tableName = this.requireNonEmptyString(params.tableName, 'createView.tableName')
    const viewId = this.requireNonEmptyString(params.viewId, 'createView.viewId')
    // default 视图在建表时就存在，单独创建会破坏约定，因此强制改走 updateView。
    if (viewId === 'default') {
      throw new Error('Default view already exists, use updateView instead')
    }
    const table = this.getTableOrThrow(tableName)
    const view = table.addView(viewId)
    if (params.config) {
      this.applyViewMetadata(table, view, params.config)
    }
    this._afterWrite()
    return view
  }

  /**
   * 更新指定视图的元数据配置。
   *
   * @param tableName 表名。
   * @param viewId 视图 ID。
   * @param updates 要应用的视图配置。
   * @returns 更新后的视图实例。
   * @throws 当表或视图不存在时抛错。
   */
  updateView(params: { tableName: string; viewId?: string; updates: Partial<IViewMetadata> }): DataView {
    const tableName = this.requireNonEmptyString(params.tableName, 'updateView.tableName')
    const viewId = params.viewId ?? 'default'
    const updates = this.requireObjectArg(params.updates, 'updateView.updates')
    const table = this.getTableOrThrow(tableName)
    const view = this.getViewOrThrow(tableName, viewId)
    this.applyViewMetadata(table, view, updates)
    this._afterWrite()
    return view
  }

  /**
   * 删除指定视图。
   *
   * @param tableName 表名。
   * @param viewId 视图 ID。
   * @throws 当表不存在，或试图删除 default 视图时抛错。
   */
  deleteView(params: { tableName: string; viewId: string }): void {
    const tableName = this.requireNonEmptyString(params.tableName, 'deleteView.tableName')
    const viewId = this.requireNonEmptyString(params.viewId, 'deleteView.viewId')
    // default 视图是 DataTable 基础组成部分，不允许删除。
    if (viewId === 'default') {
      throw new Error('Default view cannot be deleted')
    }
    this.getTableOrThrow(tableName).destroyView(viewId)
    this._afterWrite()
  }

  listAggregates(params: { tableName: string; viewId?: string }): Record<string, AggregateColumnConfig> {
    const tableName = this.requireNonEmptyString(params.tableName, 'listAggregates.tableName')
    const view = this.getViewOrThrow(tableName, params.viewId ?? 'default')
    return { ...view.aggregates }
  }

  getAggregate(params: { tableName: string; viewId?: string; key: string }): AggregateColumnConfig | undefined {
    const tableName = this.requireNonEmptyString(params.tableName, 'getAggregate.tableName')
    const key = this.requireNonEmptyString(params.key, 'getAggregate.key')
    const view = this.getViewOrThrow(tableName, params.viewId ?? 'default')
    return view.aggregates[key]
  }

  addAggregate(params: { tableName: string; viewId?: string; key: string; config: AggregateColumnConfig }): void {
    const tableName = this.requireNonEmptyString(params.tableName, 'addAggregate.tableName')
    const key = this.requireNonEmptyString(params.key, 'addAggregate.key')
    const config = this.requireObjectArg(params.config, 'addAggregate.config')
    const view = this.getViewOrThrow(tableName, params.viewId ?? 'default')
    if (view.aggregates[key] !== undefined) {
      throw new Error(`Aggregate key "${key}" already exists`)
    }
    view.setAggregates({ ...view.aggregates, [key]: config })
    this._afterWrite()
  }

  updateAggregate(
    params: { tableName: string; viewId?: string; key: string; updates: Partial<AggregateColumnConfig> },
  ): void {
    const tableName = this.requireNonEmptyString(params.tableName, 'updateAggregate.tableName')
    const key = this.requireNonEmptyString(params.key, 'updateAggregate.key')
    const updates = this.requireObjectArg(params.updates, 'updateAggregate.updates')
    const view = this.getViewOrThrow(tableName, params.viewId ?? 'default')
    const current = view.aggregates[key]
    if (current === undefined) {
      throw new Error(`Aggregate key "${key}" not found`)
    }
    view.setAggregates({
      ...view.aggregates,
      [key]: {
        ...current,
        ...updates,
      },
    })
    this._afterWrite()
  }

  removeAggregate(params: { tableName: string; viewId?: string; key: string }): void {
    const tableName = this.requireNonEmptyString(params.tableName, 'removeAggregate.tableName')
    const key = this.requireNonEmptyString(params.key, 'removeAggregate.key')
    const view = this.getViewOrThrow(tableName, params.viewId ?? 'default')
    if (view.aggregates[key] === undefined) {
      throw new Error(`Aggregate key "${key}" not found`)
    }
    const { [key]: _removedAggregate, ...nextAggregates } = view.aggregates
    view.setAggregates(nextAggregates)
    this._afterWrite()
  }

  listFieldDependencies(params: { tableName: string; viewId?: string }): FieldDependency[] {
    const tableName = this.requireNonEmptyString(params.tableName, 'listFieldDependencies.tableName')
    const view = this.getViewOrThrow(tableName, params.viewId ?? 'default')
    return [...view.fieldDependencies]
  }

  getFieldDependency(params: { tableName: string; viewId?: string; field: string }): FieldDependency | undefined {
    const tableName = this.requireNonEmptyString(params.tableName, 'getFieldDependency.tableName')
    const field = this.requireNonEmptyString(params.field, 'getFieldDependency.field')
    const view = this.getViewOrThrow(tableName, params.viewId ?? 'default')
    return view.fieldDependencies.find(rule => rule.field === field)
  }

  addFieldDependency(params: { tableName: string; viewId?: string; dependency: FieldDependency }): void {
    const tableName = this.requireNonEmptyString(params.tableName, 'addFieldDependency.tableName')
    const dependency = this.requireFieldDependency(params.dependency, 'addFieldDependency.dependency')
    const view = this.getViewOrThrow(tableName, params.viewId ?? 'default')
    if (view.fieldDependencies.some(item => item.field === dependency.field)) {
      throw new Error(`Field dependency "${dependency.field}" already exists`)
    }
    view.applyViewConfig({ fieldDependencies: [...view.fieldDependencies, dependency] })
    this._afterWrite()
  }

  updateFieldDependency(
    params: { tableName: string; viewId?: string; field: string; updates: Partial<FieldDependency> },
  ): void {
    const tableName = this.requireNonEmptyString(params.tableName, 'updateFieldDependency.tableName')
    const field = this.requireNonEmptyString(params.field, 'updateFieldDependency.field')
    const updates = this.requireObjectArg(params.updates, 'updateFieldDependency.updates')
    const view = this.getViewOrThrow(tableName, params.viewId ?? 'default')
    const index = view.fieldDependencies.findIndex(rule => rule.field === field)
    if (index < 0) {
      throw new Error(`Field dependency "${field}" not found`)
    }
    const nextRule = this.requireFieldDependency({
      ...view.fieldDependencies[index],
      ...updates,
    }, 'updateFieldDependency.updates')
    const duplicate = view.fieldDependencies.find((rule, ruleIndex) => ruleIndex !== index && rule.field === nextRule.field)
    if (duplicate) {
      throw new Error(`Field dependency "${nextRule.field}" already exists`)
    }
    const nextRules = [...view.fieldDependencies]
    nextRules[index] = nextRule
    view.applyViewConfig({ fieldDependencies: nextRules })
    this._afterWrite()
  }

  removeFieldDependency(params: { tableName: string; viewId?: string; field: string }): void {
    const tableName = this.requireNonEmptyString(params.tableName, 'removeFieldDependency.tableName')
    const field = this.requireNonEmptyString(params.field, 'removeFieldDependency.field')
    const view = this.getViewOrThrow(tableName, params.viewId ?? 'default')
    if (!view.fieldDependencies.some(rule => rule.field === field)) {
      throw new Error(`Field dependency "${field}" not found`)
    }
    view.applyViewConfig({ fieldDependencies: view.fieldDependencies.filter(rule => rule.field !== field) })
    this._afterWrite()
  }

  getComputeExpression(params: { tableName: string; columnName: string }): string | undefined {
    return this.getColumn(params)?.computeExpression
  }

  setComputeExpression(params: { tableName: string; columnName: string; expression: string }): DataTable {
    const expression = this.requireNonEmptyString(params.expression, 'setComputeExpression.expression')
    return this.updateColumn({
      tableName: params.tableName,
      columnName: params.columnName,
      updates: { computeExpression: expression },
    })
  }

  clearComputeExpression(params: { tableName: string; columnName: string }): DataTable {
    const tableName = this.requireNonEmptyString(params.tableName, 'clearComputeExpression.tableName')
    const columnName = this.requireNonEmptyString(params.columnName, 'clearComputeExpression.columnName')
    const table = this.getTableOrThrow(tableName)
    const column = this.getColumn({ tableName, columnName })
    if (!column) {
      throw new Error(`Column "${columnName}" not found in table "${tableName}"`)
    }

    const { computeExpression: _removedComputeExpression, ...nextColumn } = column
    table.updateColumn(columnName, nextColumn)
    this._afterWrite()
    return table
  }

  // ====================
  // 行数据 CRUD
  // ====================

  /**
   * 列出指定视图当前持有的全部行。
   *
   * @param tableName 表名。
   * @param viewId 视图 ID，默认 default。
   * @returns 行数组副本。
   * @throws 当表或视图不存在时抛错。
   */
  listRows(params: { tableName: string; viewId?: string }): IDataRow[] {
    const tableName = this.requireNonEmptyString(params.tableName, 'listRows.tableName')
    return [...this.getViewOrThrow(tableName, params.viewId ?? 'default').rows]
  }

  /**
   * 通过主键查找一条行数据。
   *
   * @param tableName 表名。
   * @param id 主键值。
   * @param viewId 视图 ID，默认 default。
   * @returns 命中的行；不存在时返回 undefined。
   * @throws 当表或视图不存在时抛错。
   */
  getRow(params: { tableName: string; id: string | number; viewId?: string }): IDataRow | undefined {
    const tableName = this.requireNonEmptyString(params.tableName, 'getRow.tableName')
    const viewId = params.viewId ?? 'default'
    const view = this.getViewOrThrow(tableName, viewId)
    // 行查找支持树形 children 递归扫描，避免调用方区分平铺表和树表。
    return this.findRowById(view.rows, params.id, row => view.getPkKey(row))
  }

  /**
   * 在指定视图中创建一条新行。
   *
   * @param tableName 表名。
   * @param data 新行数据。
   * @param viewId 视图 ID，默认 default。
   * @returns 本地模式下通常返回 IDataRow；远端 CRUD 模式下可能返回 CrudResult。
   * @throws 当表或视图不存在，或创建失败时抛错。
   */
  async createRow(params: { tableName: string; data: Partial<IDataRow>; viewId?: string }): Promise<IDataRow | CrudResult<IDataRow>> {
    const tableName = this.requireNonEmptyString(params.tableName, 'createRow.tableName')
    const data = this.requireObjectArg(params.data, 'createRow.data')
    const viewId = params.viewId ?? 'default'
    const table = this.getTableOrThrow(tableName)
    const view = this.getViewOrThrow(tableName, viewId)
    const result = await view.addRow(data)
    // 无远端 API 的 default view 同时承担 DataTable.rows 的静态源数据，需要双向保持一致。
    this.syncInlineDefaultRows(table, viewId)
    return result
  }

  /**
   * 在指定视图中批量创建多条新行。
   *
   * - immediate + API 模式：优先走 view.crud.batchCreateRecords
   * - 其余模式：逐条复用 view.addRow，并统一收口为 BatchResult
   */
  async createRows(params: { tableName: string; items: Array<Partial<IDataRow>>; viewId?: string }): Promise<CrudResult<BatchResult>> {
    const tableName = this.requireNonEmptyString(params.tableName, 'createRows.tableName')
    const items = this.requireNonEmptyArray(params.items, 'createRows.items')
    const viewId = params.viewId ?? 'default'
    const table = this.getTableOrThrow(tableName)
    const view = this.getViewOrThrow(tableName, viewId)
    const result = this.shouldUseRemoteBatch(table, view)
      ? await view.crud.batchCreateRecords(items)
      : await this.executeBatchLocal(items, (item) => view.addRow(item))
    this.syncInlineDefaultRows(table, viewId)
    return result
  }

  /**
   * 更新指定主键的行数据。
   *
   * @param tableName 表名。
   * @param id 主键值。
   * @param data 要合并的字段更新。
   * @param viewId 视图 ID，默认 default。
   * @returns 本地模式下通常返回 boolean；远端 CRUD 模式下可能返回 CrudResult。
   * @throws 当表或视图不存在，或更新失败时抛错。
   */
  async updateRow(params: { tableName: string; id: string | number; data: Partial<IDataRow>; viewId?: string }): Promise<boolean | CrudResult<IDataRow>> {
    const tableName = this.requireNonEmptyString(params.tableName, 'updateRow.tableName')
    const data = this.requireObjectArg(params.data, 'updateRow.data')
    const viewId = params.viewId ?? 'default'
    const table = this.getTableOrThrow(tableName)
    const view = this.getViewOrThrow(tableName, viewId)
    const result = await view.editRowById(params.id, data)
    // 仅同步内联 default view，避免误把远端视图状态反写成静态源数据。
    this.syncInlineDefaultRows(table, viewId)
    return result
  }

  /**
   * 批量更新多条行数据。
   *
   * 对话侧统一传 id + data，底层再按视图主键字段拼装 batchUpdate payload。
   */
  async updateRows(params: { tableName: string; items: Array<{ id: string | number; data: Partial<IDataRow> }>; viewId?: string }): Promise<CrudResult<BatchResult>> {
    const tableName = this.requireNonEmptyString(params.tableName, 'updateRows.tableName')
    const items = this.requireNonEmptyArray(params.items, 'updateRows.items')
    const viewId = params.viewId ?? 'default'
    const table = this.getTableOrThrow(tableName)
    const view = this.getViewOrThrow(tableName, viewId)
    const result = this.shouldUseRemoteBatch(table, view)
      ? await view.crud.batchUpdateRecords(items.map((item) => ({
        ...item.data,
        [view.primaryKey]: item.id,
      })))
      : await this.executeBatchLocal(items, (item) => view.editRowById(item.id, item.data))
    this.syncInlineDefaultRows(table, viewId)
    return result
  }

  /**
   * 删除指定主键的行数据。
   *
   * @param tableName 表名。
   * @param id 主键值。
   * @param viewId 视图 ID，默认 default。
   * @returns 本地模式下通常返回 boolean；远端 CRUD 模式下可能返回 CrudResult。
   * @throws 当表或视图不存在，或删除失败时抛错。
   */
  async deleteRow(params: { tableName: string; id: string | number; viewId?: string }): Promise<boolean | CrudResult<boolean>> {
    const tableName = this.requireNonEmptyString(params.tableName, 'deleteRow.tableName')
    const viewId = params.viewId ?? 'default'
    const table = this.getTableOrThrow(tableName)
    const view = this.getViewOrThrow(tableName, viewId)
    const result = await view.removeRow(params.id)
    this.syncInlineDefaultRows(table, viewId)
    return result
  }

  /**
   * 批量删除多条行数据。
   */
  async deleteRows(params: { tableName: string; ids: Array<string | number>; viewId?: string }): Promise<CrudResult<BatchResult>> {
    const tableName = this.requireNonEmptyString(params.tableName, 'deleteRows.tableName')
    const ids = this.requireNonEmptyArray(params.ids, 'deleteRows.ids')
    const viewId = params.viewId ?? 'default'
    const table = this.getTableOrThrow(tableName)
    const view = this.getViewOrThrow(tableName, viewId)
    const result = this.shouldUseRemoteBatch(table, view)
      ? await view.crud.batchDeleteRecords(ids)
      : await this.executeBatchLocal(ids, (id) => view.removeRow(id))
    this.syncInlineDefaultRows(table, viewId)
    return result
  }

  // ====================
  // 关系 CRUD
  // ====================

  /**
   * 列出 DataSet 中的表关系。
   *
   * @param filter 可选过滤条件，仅支持按 parentTable / childTable 过滤。
   * @returns 关系列表。
   */
  listRelations(filter?: Partial<Pick<TableRelation, 'parentTable' | 'childTable'>>): TableRelation[] {
    return (this.dataSet.tableRelations ?? []).filter((relation) => {
      if (filter?.parentTable !== undefined && relation.parentTable !== filter.parentTable) return false
      if (filter?.childTable !== undefined && relation.childTable !== filter.childTable) return false
      return true
    })
  }

  /**
   * 获取单条表关系。
   *
   * @param selector 关系选择器。
   * @returns 命中的表关系；不存在时返回 undefined。
   * @throws 当 selector 命中多条关系且未完成字段级消歧时抛错。
   */
  getRelation(selector: RelationSelector): TableRelation | undefined {
    const matches = (this.dataSet.tableRelations ?? []).filter((relation) => {
      if (relation.parentTable !== selector.parentTable || relation.childTable !== selector.childTable) return false
      if (selector.parentField !== undefined && relation.parentField !== selector.parentField) return false
      if (selector.childField !== undefined && relation.childField !== selector.childField) return false
      return true
    })
    if (matches.length > 1) {
      throw new Error(`Relation ${selector.parentTable}→${selector.childTable} is ambiguous, specify parentField/childField`)
    }
    return matches[0]
  }

  /**
   * 创建一条表关系。
   *
   * @param params 关系参数。
   * @returns 新创建的表关系。
   * @throws 当父表、子表、字段不存在或关系重复时抛错。
   */
  createRelation(params: { parentTable: string; childTable: string; parentField: string; childField: string; relationName?: string }): TableRelation {
    this.dataSet.addRelation(params)
    this._afterWrite()
    const relation = this.getRelation(params)
    if (!relation) {
      throw new Error(`Relation "${params.parentTable}→${params.childTable}" not found`)
    }
    return relation
  }

  /**
   * 更新一条表关系。
   *
   * @param selector 用于定位原关系的选择器。
   * @param updates 关系更新内容。
   * @returns 更新后的表关系。
   * @throws 当关系不存在、选择器不唯一或更新后关系非法时抛错。
   */
  updateRelation(params: { selector: RelationSelector; updates: Partial<TableRelation> }): TableRelation {
    const updates = this.requireObjectArg(params.updates, 'updateRelation.updates')
    const result = this.dataSet.updateRelation(params.selector, updates)
    this._afterWrite()
    return result
  }

  /**
   * 删除一条表关系。
   *
   * @param selector 关系选择器。
   * @throws 当关系不存在，或定位到多条关系时抛错。
   */
  deleteRelation(selector: RelationSelector): void {
    this.dataSet.removeRelation(selector)
    this._afterWrite()
  }

  // ====================
  // 依赖 CRUD
  // ====================

  /**
   * 列出 DataSet 中的视图依赖。
   *
   * @param filter 可选过滤条件，支持按 id / targetViewKey 过滤。
   * @returns 依赖列表。
   */
  listDependencies(filter?: Partial<Pick<ViewDependency, 'id' | 'targetViewKey'>>): ViewDependency[] {
    return (this.dataSet.viewDependencies ?? []).filter((dependency) => {
      if (filter?.id !== undefined && dependency.id !== filter.id) return false
      if (filter?.targetViewKey !== undefined && dependency.targetViewKey !== filter.targetViewKey) return false
      return true
    })
  }

  /**
   * 获取一条视图依赖。
   *
   * @param id 依赖 ID。
   * @returns 命中的依赖；不存在时返回 undefined。
   */
  getDependency(params: { id: string }): ViewDependency | undefined {
    const id = this.requireNonEmptyString(params.id, 'getDependency.id')
    return (this.dataSet.viewDependencies ?? []).find(dependency => dependency.id === id)
  }

  /**
   * 创建一条视图依赖。
   *
   * @param params 依赖参数。
   * @returns 新创建的依赖。
   * @throws 当依赖引用非法时抛错。
   */
  createDependency(params: { dependency: ViewDependency }): ViewDependency {
    const dependencyInput = this.requireViewDependency(params.dependency, 'createDependency.dependency')
    this.dataSet.addDependency(dependencyInput)
    this._afterWrite()
    const dependency = this.getDependency({ id: dependencyInput.id })
    if (!dependency) {
      throw new Error(`Dependency "${dependencyInput.id}" not found`)
    }
    return dependency
  }

  /**
   * 更新一条视图依赖。
   *
   * @param id 原依赖 ID。
   * @param updates 依赖更新内容。
   * @returns 更新后的依赖。
   * @throws 当依赖不存在或更新目标非法时抛错。
   */
  updateDependency(params: { id: string; updates: Partial<ViewDependency> }): ViewDependency {
    const id = this.requireNonEmptyString(params.id, 'updateDependency.id')
    const updates = this.requireObjectArg(params.updates, 'updateDependency.updates')
    const result = this.dataSet.updateDependency(id, updates)
    this._afterWrite()
    return result
  }

  /**
   * 删除一条视图依赖。
   *
   * @param id 依赖 ID。
   * @throws 当依赖不存在时抛错。
   */
  deleteDependency(params: { id: string }): void {
    const id = this.requireNonEmptyString(params.id, 'deleteDependency.id')
    this.dataSet.removeDependency(id)
    this._afterWrite()
  }

  // ====================
  // 内部辅助方法
  // ====================

  /**
   * 获取数据表；不存在时直接抛错。
   *
   * @param tableName 表名。
   * @returns 数据表实例。
   * @throws 当表不存在时抛错。
   */
  private getTableOrThrow(tableName: string): DataTable {
    const table = this.dataSet.getTable(tableName)
    if (!table) {
      throw new Error(`Table "${tableName}" not found in DataSet "${this.dataSetName}"`)
    }
    return table
  }

  private requireNonEmptyString(value: string | undefined, label: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${label} must be a non-empty string`)
    }
    return value
  }

  private requireObjectArg<T>(value: T, label: string): Exclude<T, undefined> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`${label} must be an object`)
    }
    return value as Exclude<T, undefined>
  }

  private requireNonEmptyArray<T>(value: T[] | undefined, label: string): T[] {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error(`${label} must be a non-empty array`)
    }
    return value
  }

  private requireFieldDependency(value: FieldDependency | Partial<FieldDependency>, label: string): FieldDependency {
    const dependency = this.requireObjectArg(value, label) as FieldDependency
    this.requireNonEmptyString(dependency.field, `${label}.field`)
    if (!Array.isArray(dependency.dependsOn)) {
      throw new Error(`${label}.dependsOn must be an array`)
    }
    if (!dependency.dependsOn.every(field => typeof field === 'string' && field.length > 0)) {
      throw new Error(`${label}.dependsOn must only contain non-empty strings`)
    }
    if (dependency.lookup !== undefined) {
      this.requireNonEmptyString(dependency.lookup.viewKey, `${label}.lookup.viewKey`)
      this.requireNonEmptyString(dependency.lookup.matchField, `${label}.lookup.matchField`)
      this.requireObjectArg(dependency.lookup.map, `${label}.lookup.map`)
    }
    return dependency
  }

  private requireViewDependency(value: ViewDependency | Partial<ViewDependency>, label: string): ViewDependency {
    const dependency = this.requireObjectArg(value, label) as ViewDependency
    this.requireNonEmptyString(dependency.id, `${label}.id`)
    this.requireNonEmptyString(dependency.targetViewKey, `${label}.targetViewKey`)
    if (!Array.isArray(dependency.sources) || dependency.sources.length === 0) {
      throw new Error(`${label}.sources must be a non-empty array`)
    }
    if (!Array.isArray(dependency.bindings) || dependency.bindings.length === 0) {
      throw new Error(`${label}.bindings must be a non-empty array`)
    }
    return dependency
  }

  private normalizeTableNameArg(
    tableNameOrParams: string | { tableName: string },
    methodName: string,
  ): string {
    return typeof tableNameOrParams === 'string'
      ? this.requireNonEmptyString(tableNameOrParams, `${methodName}.tableName`)
      : this.requireNonEmptyString(tableNameOrParams.tableName, `${methodName}.tableName`)
  }

  /**
   * 获取视图；不存在时直接抛错。
   *
   * @param tableName 表名。
   * @param viewId 视图 ID。
   * @returns 视图实例。
   * @throws 当视图不存在时抛错。
   */
  private getViewOrThrow(tableName: string, viewId = 'default'): DataView {
    const view = this.dataSet.getView(tableName, viewId)
    if (!view) {
      throw new Error(`View "${tableName}:${viewId}" not found in DataSet "${this.dataSetName}"`)
    }
    return view
  }

  /**
   * 将视图元数据应用到指定视图实例。
   *
   * @param table 视图所属数据表。
   * @param view 目标视图。
   * @param metadata 需要应用的视图元数据。
   */
  private applyViewMetadata(table: DataTable, view: DataView, metadata: Partial<IViewMetadata>): void {
    const rows = metadata.rows
    if (rows !== undefined) {
      // rows 先落到 DataView，再补齐内联 default view 的 DataTable.rows，保证视图和源数据一致。
      view.replaceRows([...rows])
      if (view.viewId === 'default' && table.api === undefined) {
        table.rows = [...rows]
      }
    }
    view.applyViewConfig(metadata)
  }

  /**
   * 将 default 视图的当前行集同步回 DataTable.rows。
   * 仅内联数据模式需要这样做；远端 API 模式下不应回写静态 rows。
   *
   * @param table 数据表。
   * @param viewId 当前操作的视图 ID。
   */
  private syncInlineDefaultRows(table: DataTable, viewId: string): void {
    if (viewId !== 'default' || table.api !== undefined) return
    const defaultView = table.getView('default')
    table.rows = [...(defaultView?.rows ?? [])]
  }

  private shouldUseRemoteBatch(table: DataTable, view: DataView): boolean {
    return table.api !== undefined && view.commitMode === 'immediate'
  }

  private async executeBatchLocal<T>(
    items: T[],
    executor: (item: T) => Promise<unknown>,
  ): Promise<CrudResult<BatchResult>> {
    const results: CrudResult[] = []
    for (const item of items) {
      try {
        const result = await executor(item)
        if (result === false) {
          results.push({ success: false, message: `Item "${String(item)}" not found` })
        } else {
          results.push(this.toCrudResult(result, true))
        }
      } catch (error) {
        results.push(this.toCrudResult(error, false))
      }
    }
    return this.toBatchCrudResult(results)
  }

  private toCrudResult(result: unknown, defaultSuccess: boolean): CrudResult {
    if (typeof result === 'object' && result !== null && 'success' in result) {
      return result as CrudResult
    }

    if (result instanceof Error) {
      return {
        success: false,
        error: result,
        message: result.message,
      }
    }

    return {
      success: defaultSuccess,
      ...(result !== undefined ? { data: result } : {}),
    }
  }

  private toBatchCrudResult(results: CrudResult[]): CrudResult<BatchResult> {
    const errors = results
      .map((result) => result.error)
      .filter((error): error is Error => error instanceof Error)
    const failureCount = results.filter((result) => result.success === false).length

    return {
      success: true,
      data: {
        successCount: results.length - failureCount,
        failureCount,
        results,
        errors,
      },
      ...(failureCount > 0 ? { message: `Batch completed with ${failureCount} failure(s)` } : {}),
    }
  }


  /**
   * 给数据表写入资源语义元数据。
   *
   * 这些字段只描述“资源身份”和“业务角色”，不参与运行时行为判断。
   */
  private applyTableSemanticMetadata(
    table: DataTable,
    metadata: Pick<DataSetCrudToolUpdateTableOptions, 'resourceType' | 'resourceId' | 'businessCategory'>,
    allowNull = false,
  ): void {
    if (metadata.resourceType !== undefined) {
      if (allowNull && metadata.resourceType === null) delete table.resourceType
      else if (metadata.resourceType !== null) table.resourceType = metadata.resourceType
    }
    if (metadata.resourceId !== undefined) {
      if (allowNull && metadata.resourceId === null) delete table.resourceId
      else if (metadata.resourceId !== null) table.resourceId = metadata.resourceId
    }
    if (metadata.businessCategory !== undefined) {
      if (allowNull && metadata.businessCategory === null) delete table.businessCategory
      else if (metadata.businessCategory !== null) table.businessCategory = metadata.businessCategory
    }
  }

  /**
   * 按主键在 rows 中查找单条记录。
   * 支持递归扫描树形 children 节点。
   *
   * @param rows 起始行集合。
   * @param id 主键值。
   * @param getPkKey 从单行数据中提取主键值的函数。
   * @returns 命中的行；不存在时返回 undefined。
   */
  private findRowById(
    rows: readonly IDataRow[],
    id: string | number,
    getPkKey: (row: IDataRow) => string | number | undefined,
  ): IDataRow | undefined {
    // 使用显式队列遍历 children，避免树形结构场景遗漏深层节点。
    const stack = [...rows]
    while (stack.length > 0) {
      const row = stack.shift()
      if (!row) continue
      if (getPkKey(row) === id) return row
      const children = row['children']
      if (Array.isArray(children)) {
        stack.unshift(...children.filter((child): child is IDataRow => typeof child === 'object' && child !== null))
      }
    }
    return undefined
  }
}
