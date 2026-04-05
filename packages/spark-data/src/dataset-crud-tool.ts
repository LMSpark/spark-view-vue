import { DataSet } from './dataset'
import type { DataTable } from './data-table'
import type { DataView } from './data-view'
import type {
  CrudApi,
  CrudOperationConfig,
  CrudResult,
  DataColumn,
  IDataSet,
  IDataSetMetadata,
  IDataRow,
  IViewMetadata,
  TableRelation,
  ViewDependency,
  DependencyType,
  TableSemanticMetadata,
  TableResourceType,
  TableBusinessCategory,
} from './types'

/**
 * 创建数据表时的输入参数。
 */
export interface DataSetCrudToolCreateTableOptions extends TableSemanticMetadata {
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
export interface DataSetCrudToolUpdateTableOptions {
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

type DataSetCrudToolTableNameParams = {
  tableName: string
}

type DataSetCrudToolColumnSelector = DataSetCrudToolTableNameParams & {
  columnName: string
}

type DataSetCrudToolCreateColumnParams = DataSetCrudToolTableNameParams & {
  column: DataColumn
}

type DataSetCrudToolUpdateColumnParams = DataSetCrudToolColumnSelector & {
  updates: Partial<DataColumn>
}

type DataSetCrudToolUpdateTableParams = DataSetCrudToolTableNameParams & DataSetCrudToolUpdateTableOptions

type DataSetCrudToolViewSelector = DataSetCrudToolTableNameParams & {
  viewId?: string
}

type DataSetCrudToolCreateViewParams = DataSetCrudToolTableNameParams & {
  viewId: string
  config?: IViewMetadata
}

type DataSetCrudToolUpdateViewParams = DataSetCrudToolTableNameParams & {
  viewId?: string
  updates: Partial<IViewMetadata>
}

type DataSetCrudToolDeleteViewParams = DataSetCrudToolTableNameParams & {
  viewId: string
}

type DataSetCrudToolRowSelector = DataSetCrudToolTableNameParams & {
  id: string | number
  viewId?: string
}

type DataSetCrudToolCreateRowParams = DataSetCrudToolTableNameParams & {
  data: Partial<IDataRow>
  viewId?: string
}

type DataSetCrudToolUpdateRowParams = DataSetCrudToolRowSelector & {
  data: Partial<IDataRow>
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

/**
 * 创建表关系所需参数。
 */
type CreateRelationParams = {
  parentTable: string
  childTable: string
  parentField: string
  childField: string
  relationName?: string
}

type DataSetCrudToolUpdateRelationParams = {
  selector: RelationSelector
  updates: Partial<TableRelation>
}

  type DataSetCrudToolDeleteRelationParams = { selector: RelationSelector }

/**
 * 创建视图依赖所需参数。
 */
type CreateDependencyParams = {
  parentTable: string
  childTable: string
  dependencyType?: DependencyType | undefined
  autoLoad?: boolean
}

type DataSetCrudToolDependencySelector = {
  parentTable: string
  childTable: string
}

type DataSetCrudToolUpdateDependencyParams = DataSetCrudToolDependencySelector & {
  updates: Partial<ViewDependency>
}

/**
 * DataSet 级统一 CRUD facade。
 *
 * 设计目标：
 * 1. 构造时只要求 dataSetName，外部无需先手动拼装 DataSet。
 * 2. 统一收口表、列、视图、行、关系、依赖这几类对象的常用操作。
 * 3. 全部复用现有 DataSet/DataTable/DataView 能力，避免再造第二套状态模型。
 * 4. 多参数公开方法同时支持对象参数和旧的位置参数，便于 LLM / 动态调度直接传 JSON object。
 */
export class DataSetCrudTool {
  /**
   * 当前工具类持有的 DataSet 实例。
   */
  readonly dataSet: DataSet

  /**
   * 创建一个绑定到指定 dataSetName 的统一 CRUD 工具。
   *
   * @param dataSetName DataSet 名称。
   */
  constructor(dataSetName: string) {
    // 从最小空配置创建 DataSet，后续对象全部通过本工具类逐步补齐。
    this.dataSet = DataSet.fromJson({
      dataSetName,
      tables: {},
    })
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
  getTable(tableNameOrParams: string | DataSetCrudToolTableNameParams): DataTable | undefined {
    return this.dataSet.getTable(this.normalizeTableNameArg(tableNameOrParams, 'getTable'))
  }

  /**
   * 列出指定数据表的全部列定义。
   *
   * @param tableName 表名。
   * @returns 列定义副本列表。
   * @throws 当表不存在时抛错。
   */
  listColumns(tableNameOrParams: string | DataSetCrudToolTableNameParams): DataColumn[] {
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
  getColumn(tableName: string, columnName: string): DataColumn | undefined
  getColumn(params: DataSetCrudToolColumnSelector): DataColumn | undefined
  getColumn(
    tableNameOrParams: string | DataSetCrudToolColumnSelector,
    columnName?: string,
  ): DataColumn | undefined {
    const selector = this.normalizeColumnSelectorArgs(tableNameOrParams, columnName, 'getColumn')
    return this.getTableOrThrow(selector.tableName).columns.find(column => column.name === selector.columnName)
  }

  /**
   * 向指定数据表追加一列。
   *
   * @param tableName 表名。
   * @param column 新列定义。
   * @returns 更新后的 DataTable。
   * @throws 当表不存在或列定义非法时抛错。
   */
  createColumn(tableName: string, column: DataColumn): DataTable
  createColumn(params: DataSetCrudToolCreateColumnParams): DataTable
  createColumn(
    tableNameOrParams: string | DataSetCrudToolCreateColumnParams,
    column?: DataColumn,
  ): DataTable {
    // 必须走 DataTable.addColumns，不能直接改 metadata，否则 validator / view 列缓存会失效。
    const next = this.normalizeCreateColumnArgs(tableNameOrParams, column)
    const table = this.getTableOrThrow(next.tableName)
    table.addColumns([next.column])
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
  updateColumn(tableName: string, columnName: string, updates: Partial<DataColumn>): DataTable
  updateColumn(params: DataSetCrudToolUpdateColumnParams): DataTable
  updateColumn(
    tableNameOrParams: string | DataSetCrudToolUpdateColumnParams,
    columnNameOrUpdates?: string | Partial<DataColumn>,
    maybeUpdates?: Partial<DataColumn>,
  ): DataTable {
    // 列更新后会触发 DataTable 内部运行时刷新链，保证 DataView.getColumn 与 schema 保持一致。
    const next = this.normalizeUpdateColumnArgs(tableNameOrParams, columnNameOrUpdates, maybeUpdates)
    const table = this.getTableOrThrow(next.tableName)
    table.updateColumn(next.columnName, next.updates)
    return table
  }

  /**
   * 删除指定列。
   *
   * @param tableName 表名。
   * @param columnName 列名。
   * @throws 当表或列不存在时抛错。
   */
  deleteColumn(tableName: string, columnName: string): void
  deleteColumn(params: DataSetCrudToolColumnSelector): void
  deleteColumn(
    tableNameOrParams: string | DataSetCrudToolColumnSelector,
    columnName?: string,
  ): void {
    const selector = this.normalizeColumnSelectorArgs(tableNameOrParams, columnName, 'deleteColumn')
    this.getTableOrThrow(selector.tableName).removeColumn(selector.columnName)
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
  updateTable(tableName: string, updates: DataSetCrudToolUpdateTableOptions): DataTable
  updateTable(params: DataSetCrudToolUpdateTableParams): DataTable
  updateTable(
    tableNameOrParams: string | DataSetCrudToolUpdateTableParams,
    updates?: DataSetCrudToolUpdateTableOptions,
  ): DataTable {
    const next = this.normalizeUpdateTableArgs(tableNameOrParams, updates)
    const table = this.getTableOrThrow(next.tableName)

    // 结构变更优先执行，避免后续 rows / api / crudConfig 更新面对旧 schema。
    if (next.columnsToAdd?.length) {
      table.addColumns(next.columnsToAdd)
    }
    if (next.columnUpdates?.length) {
      for (const entry of next.columnUpdates) {
        table.updateColumn(entry.columnName, entry.updates)
      }
    }
    if (next.columnsToRemove?.length) {
      for (const columnName of next.columnsToRemove) {
        table.removeColumn(columnName)
      }
    }
    if (next.api !== undefined) {
      table.setApi(next.api)
    }
    if (next.crudConfig !== undefined) {
      if (next.crudConfig === null) {
        delete table.crudConfig
      } else {
        table.setCrudConfig(next.crudConfig)
      }
    }
    this.applyTableSemanticMetadataUpdates(table, next)
    if (next.defaultRows !== undefined) {
      table.rows = [...next.defaultRows]
      table.getView('default')?.replaceRows([...next.defaultRows])
    }

    return table
  }

  /**
   * 删除指定数据表。
   *
   * @param tableName 表名。
   * @throws 当表不存在，或仍被 relation / dependency 引用时抛错。
   */
  deleteTable(tableNameOrParams: string | DataSetCrudToolTableNameParams): void {
    this.dataSetContract.removeTable(this.normalizeTableNameArg(tableNameOrParams, 'deleteTable'))
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
  listViews(tableNameOrParams: string | DataSetCrudToolTableNameParams): DataView[] {
    return Object.values(this.getTableOrThrow(this.normalizeTableNameArg(tableNameOrParams, 'listViews')).views)
  }

  /**
   * 获取指定视图。
   *
   * @param tableName 表名。
   * @param viewId 视图 ID，默认 default。
   * @returns 视图实例；不存在时返回 undefined。
   */
  getView(tableName: string, viewId?: string): DataView | undefined
  getView(params: DataSetCrudToolViewSelector): DataView | undefined
  getView(
    tableNameOrParams: string | DataSetCrudToolViewSelector,
    viewId = 'default',
  ): DataView | undefined {
    const selector = this.normalizeViewSelectorArgs(tableNameOrParams, viewId, 'getView')
    return this.dataSet.getView(selector.tableName, selector.viewId)
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
  createView(tableName: string, viewId: string, config?: IViewMetadata): DataView
  createView(params: DataSetCrudToolCreateViewParams): DataView
  createView(
    tableNameOrParams: string | DataSetCrudToolCreateViewParams,
    viewIdOrConfig?: string | IViewMetadata,
    config?: IViewMetadata,
  ): DataView {
    const next = this.normalizeCreateViewArgs(tableNameOrParams, viewIdOrConfig, config)
    // default 视图在建表时就存在，单独创建会破坏约定，因此强制改走 updateView。
    if (next.viewId === 'default') {
      throw new Error('Default view already exists, use updateView instead')
    }

    const table = this.getTableOrThrow(next.tableName)
    const view = table.addView(next.viewId)
    if (next.config) {
      this.applyViewMetadata(table, view, next.config)
    }
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
  updateView(tableName: string, viewId: string, updates: Partial<IViewMetadata>): DataView
  updateView(params: DataSetCrudToolUpdateViewParams): DataView
  updateView(
    tableNameOrParams: string | DataSetCrudToolUpdateViewParams,
    viewIdOrUpdates?: string | Partial<IViewMetadata>,
    maybeUpdates?: Partial<IViewMetadata>,
  ): DataView {
    const next = this.normalizeUpdateViewArgs(tableNameOrParams, viewIdOrUpdates, maybeUpdates)
    const table = this.getTableOrThrow(next.tableName)
    const view = this.getViewOrThrow(next.tableName, next.viewId)
    this.applyViewMetadata(table, view, next.updates)
    return view
  }

  /**
   * 删除指定视图。
   *
   * @param tableName 表名。
   * @param viewId 视图 ID。
   * @throws 当表不存在，或试图删除 default 视图时抛错。
   */
  deleteView(tableName: string, viewId: string): void
  deleteView(params: DataSetCrudToolDeleteViewParams): void
  deleteView(
    tableNameOrParams: string | DataSetCrudToolDeleteViewParams,
    viewId?: string,
  ): void {
    const next = this.normalizeRequiredViewSelectorArgs(tableNameOrParams, viewId, 'deleteView')
    // default 视图是 DataTable 基础组成部分，不允许删除。
    if (next.viewId === 'default') {
      throw new Error('Default view cannot be deleted')
    }
    this.getTableOrThrow(next.tableName).destroyView(next.viewId)
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
  listRows(tableName: string, viewId?: string): IDataRow[]
  listRows(params: DataSetCrudToolViewSelector): IDataRow[]
  listRows(
    tableNameOrParams: string | DataSetCrudToolViewSelector,
    viewId = 'default',
  ): IDataRow[] {
    const selector = this.normalizeViewSelectorArgs(tableNameOrParams, viewId, 'listRows')
    return [...this.getViewOrThrow(selector.tableName, selector.viewId).rows]
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
  getRow(tableName: string, id: string | number, viewId?: string): IDataRow | undefined
  getRow(params: DataSetCrudToolRowSelector): IDataRow | undefined
  getRow(
    tableNameOrParams: string | DataSetCrudToolRowSelector,
    idOrViewId?: string | number,
    viewId = 'default',
  ): IDataRow | undefined {
    const next = this.normalizeRowSelectorArgs(tableNameOrParams, idOrViewId, viewId, 'getRow')
    const view = this.getViewOrThrow(next.tableName, next.viewId)
    // 行查找支持树形 children 递归扫描，避免调用方区分平铺表和树表。
    return this.findRowById(view.rows, next.id, row => view.getPkKey(row))
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
  createRow(tableName: string, data: Partial<IDataRow>, viewId?: string): Promise<IDataRow | CrudResult<IDataRow>>
  createRow(params: DataSetCrudToolCreateRowParams): Promise<IDataRow | CrudResult<IDataRow>>
  async createRow(
    tableNameOrParams: string | DataSetCrudToolCreateRowParams,
    data?: Partial<IDataRow>,
    viewId = 'default',
  ): Promise<IDataRow | CrudResult<IDataRow>> {
    const next = this.normalizeCreateRowArgs(tableNameOrParams, data, viewId)
    const table = this.getTableOrThrow(next.tableName)
    const view = this.getViewOrThrow(next.tableName, next.viewId)
    const result = await view.addRow(next.data)
    // 无远端 API 的 default view 同时承担 DataTable.rows 的静态源数据，需要双向保持一致。
    this.syncInlineDefaultRows(table, next.viewId)
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
  updateRow(
    tableName: string,
    id: string | number,
    data: Partial<IDataRow>,
    viewId?: string,
  ): Promise<boolean | CrudResult<IDataRow>>
  updateRow(params: DataSetCrudToolUpdateRowParams): Promise<boolean | CrudResult<IDataRow>>
  async updateRow(
    tableNameOrParams: string | DataSetCrudToolUpdateRowParams,
    idOrData?: string | number | Partial<IDataRow>,
    dataOrViewId?: Partial<IDataRow> | string,
    viewId = 'default',
  ): Promise<boolean | CrudResult<IDataRow>> {
    const next = this.normalizeUpdateRowArgs(tableNameOrParams, idOrData, dataOrViewId, viewId)
    const table = this.getTableOrThrow(next.tableName)
    const view = this.getViewOrThrow(next.tableName, next.viewId)
    const result = await view.editRowById(next.id, next.data)
    // 仅同步内联 default view，避免误把远端视图状态反写成静态源数据。
    this.syncInlineDefaultRows(table, next.viewId)
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
  deleteRow(tableName: string, id: string | number, viewId?: string): Promise<boolean | CrudResult<boolean>>
  deleteRow(params: DataSetCrudToolRowSelector): Promise<boolean | CrudResult<boolean>>
  async deleteRow(
    tableNameOrParams: string | DataSetCrudToolRowSelector,
    idOrViewId?: string | number,
    viewId = 'default',
  ): Promise<boolean | CrudResult<boolean>> {
    const next = this.normalizeRowSelectorArgs(tableNameOrParams, idOrViewId, viewId, 'deleteRow')
    const table = this.getTableOrThrow(next.tableName)
    const view = this.getViewOrThrow(next.tableName, next.viewId)
    const result = await view.removeRow(next.id)
    this.syncInlineDefaultRows(table, next.viewId)
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
    const matches = this.findRelations(selector)
    if (matches.length > 1) {
      // 同一父子表可能存在多条关系，此时要求调用方显式给出字段级 selector，避免误删误改。
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
  createRelation(params: CreateRelationParams): TableRelation {
    this.dataSet.addRelation(params)
    return this.getRelationOrThrow(params)
  }

  /**
   * 更新一条表关系。
   *
   * @param selector 用于定位原关系的选择器。
   * @param updates 关系更新内容。
   * @returns 更新后的表关系。
   * @throws 当关系不存在、选择器不唯一或更新后关系非法时抛错。
   */
  updateRelation(selector: RelationSelector, updates: Partial<TableRelation>): TableRelation
  updateRelation(params: DataSetCrudToolUpdateRelationParams): TableRelation
  updateRelation(
    selectorOrParams: RelationSelector | DataSetCrudToolUpdateRelationParams,
    updates?: Partial<TableRelation>,
  ): TableRelation {
    const next = this.normalizeUpdateRelationArgs(selectorOrParams, updates)
    return this.dataSetContract.updateRelation(next.selector, next.updates)
  }

  /**
   * 删除一条表关系。
   * 支持字段级 selector 和兼容的 parentTable + childTable 两种签名。
   *
   * @param selectorOrParentTable 关系选择器，或 parentTable。
   * @param childTable 当第一个参数为 parentTable 时，需要补充 childTable。
   * @throws 当关系不存在，或按父子表定位但存在多条关系时抛错。
   */
  deleteRelation(selectorOrParams: RelationSelector | DataSetCrudToolDeleteRelationParams): void
  deleteRelation(parentTable: string, childTable: string): void
  deleteRelation(
    selectorOrParentTable: string | RelationSelector | DataSetCrudToolDeleteRelationParams,
    childTable?: string,
  ): void {
    if (typeof selectorOrParentTable === 'string') {
      this.dataSet.removeRelation(
        this.requireNonEmptyString(selectorOrParentTable, 'deleteRelation.parentTable'),
        this.requireNonEmptyString(childTable, 'deleteRelation.childTable'),
      )
      return
    }
    if ('selector' in selectorOrParentTable) {
      this.dataSet.removeRelation(selectorOrParentTable.selector)
      return
    }
    this.dataSet.removeRelation(selectorOrParentTable)
  }

  // ====================
  // 依赖 CRUD
  // ====================

  /**
   * 列出 DataSet 中的视图依赖。
   *
   * @param filter 可选过滤条件，仅支持按 parentTable / childTable 过滤。
   * @returns 依赖列表。
   */
  listDependencies(filter?: Partial<Pick<ViewDependency, 'parentTable' | 'childTable'>>): ViewDependency[] {
    return (this.dataSet.viewDependencies ?? []).filter((dependency) => {
      if (filter?.parentTable !== undefined && dependency.parentTable !== filter.parentTable) return false
      if (filter?.childTable !== undefined && dependency.childTable !== filter.childTable) return false
      return true
    })
  }

  /**
   * 获取一条视图依赖。
   *
   * @param parentTable 父表名。
   * @param childTable 子表名。
   * @returns 命中的依赖；不存在时返回 undefined。
   */
  getDependency(parentTable: string, childTable: string): ViewDependency | undefined
  getDependency(params: DataSetCrudToolDependencySelector): ViewDependency | undefined
  getDependency(
    parentTableOrParams: string | DataSetCrudToolDependencySelector,
    childTable?: string,
  ): ViewDependency | undefined {
    const next = this.normalizeDependencySelectorArgs(parentTableOrParams, childTable, 'getDependency')
    return (this.dataSet.viewDependencies ?? []).find(
      dependency => dependency.parentTable === next.parentTable && dependency.childTable === next.childTable,
    )
  }

  /**
   * 创建一条视图依赖。
   *
   * @param params 依赖参数。
   * @returns 新创建的依赖。
   * @throws 当依赖引用非法或底层 relation 不满足要求时抛错。
   */
  createDependency(params: CreateDependencyParams): ViewDependency {
    this.dataSet.addDependency(params)
    return this.getDependencyOrThrow(params.parentTable, params.childTable)
  }

  /**
   * 更新一条视图依赖。
   *
   * @param parentTable 原父表名。
   * @param childTable 原子表名。
   * @param updates 依赖更新内容。
   * @returns 更新后的依赖。
   * @throws 当依赖不存在、更新目标非法或缺少底层 relation 时抛错。
   */
  updateDependency(
    parentTable: string,
    childTable: string,
    updates: Partial<ViewDependency>,
  ): ViewDependency
  updateDependency(params: DataSetCrudToolUpdateDependencyParams): ViewDependency
  updateDependency(
    parentTableOrParams: string | DataSetCrudToolUpdateDependencyParams,
    childTableOrUpdates?: string | Partial<ViewDependency>,
    updates?: Partial<ViewDependency>,
  ): ViewDependency {
    const next = this.normalizeUpdateDependencyArgs(parentTableOrParams, childTableOrUpdates, updates)
    return this.dataSetContract.updateDependency(next.parentTable, next.childTable, next.updates)
  }

  /**
   * 删除一条视图依赖。
   *
   * @param parentTable 父表名。
   * @param childTable 子表名。
   * @throws 当依赖不存在时抛错。
   */
  deleteDependency(parentTable: string, childTable: string): void
  deleteDependency(params: DataSetCrudToolDependencySelector): void
  deleteDependency(
    parentTableOrParams: string | DataSetCrudToolDependencySelector,
    childTable?: string,
  ): void {
    const next = this.normalizeDependencySelectorArgs(parentTableOrParams, childTable, 'deleteDependency')
    this.dataSet.removeDependency(next.parentTable, next.childTable)
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

  /**
   * 以 IDataSet 契约暴露 DataSet，便于统一走接口能力。
   *
   * @returns IDataSet 视图。
   */
  private get dataSetContract(): IDataSet {
    return this.dataSet
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

  private normalizeTableNameArg(
    tableNameOrParams: string | DataSetCrudToolTableNameParams,
    methodName: string,
  ): string {
    return typeof tableNameOrParams === 'string'
      ? this.requireNonEmptyString(tableNameOrParams, `${methodName}.tableName`)
      : this.requireNonEmptyString(tableNameOrParams.tableName, `${methodName}.tableName`)
  }

  private normalizeColumnSelectorArgs(
    tableNameOrParams: string | DataSetCrudToolColumnSelector,
    columnName: string | undefined,
    methodName: string,
  ): DataSetCrudToolColumnSelector {
    if (typeof tableNameOrParams === 'string') {
      return {
        tableName: this.requireNonEmptyString(tableNameOrParams, `${methodName}.tableName`),
        columnName: this.requireNonEmptyString(columnName, `${methodName}.columnName`),
      }
    }

    return {
      tableName: this.requireNonEmptyString(tableNameOrParams.tableName, `${methodName}.tableName`),
      columnName: this.requireNonEmptyString(tableNameOrParams.columnName, `${methodName}.columnName`),
    }
  }

  private normalizeCreateColumnArgs(
    tableNameOrParams: string | DataSetCrudToolCreateColumnParams,
    column: DataColumn | undefined,
  ): DataSetCrudToolCreateColumnParams {
    if (typeof tableNameOrParams === 'string') {
      return {
        tableName: this.requireNonEmptyString(tableNameOrParams, 'createColumn.tableName'),
        column: this.requireObjectArg(column, 'createColumn.column'),
      }
    }

    return {
      tableName: this.requireNonEmptyString(tableNameOrParams.tableName, 'createColumn.tableName'),
      column: this.requireObjectArg(tableNameOrParams.column, 'createColumn.column'),
    }
  }

  private normalizeUpdateColumnArgs(
    tableNameOrParams: string | DataSetCrudToolUpdateColumnParams,
    columnNameOrUpdates: string | Partial<DataColumn> | undefined,
    maybeUpdates?: Partial<DataColumn>,
  ): DataSetCrudToolUpdateColumnParams {
    if (typeof tableNameOrParams === 'string') {
      return {
        tableName: this.requireNonEmptyString(tableNameOrParams, 'updateColumn.tableName'),
        columnName: this.requireNonEmptyString(
          typeof columnNameOrUpdates === 'string' ? columnNameOrUpdates : undefined,
          'updateColumn.columnName',
        ),
        updates: this.requireObjectArg(maybeUpdates, 'updateColumn.updates'),
      }
    }

    return {
      tableName: this.requireNonEmptyString(tableNameOrParams.tableName, 'updateColumn.tableName'),
      columnName: this.requireNonEmptyString(tableNameOrParams.columnName, 'updateColumn.columnName'),
      updates: this.requireObjectArg(tableNameOrParams.updates, 'updateColumn.updates'),
    }
  }

  private normalizeUpdateTableArgs(
    tableNameOrParams: string | DataSetCrudToolUpdateTableParams,
    updates?: DataSetCrudToolUpdateTableOptions,
  ): DataSetCrudToolUpdateTableParams {
    if (typeof tableNameOrParams === 'string') {
      return {
        tableName: this.requireNonEmptyString(tableNameOrParams, 'updateTable.tableName'),
        ...(updates ?? {}),
      }
    }

    return {
      ...tableNameOrParams,
      tableName: this.requireNonEmptyString(tableNameOrParams.tableName, 'updateTable.tableName'),
    }
  }

  private normalizeViewSelectorArgs(
    tableNameOrParams: string | DataSetCrudToolViewSelector,
    viewId: string | undefined,
    methodName: string,
  ): Required<DataSetCrudToolViewSelector> {
    if (typeof tableNameOrParams === 'string') {
      return {
        tableName: this.requireNonEmptyString(tableNameOrParams, `${methodName}.tableName`),
        viewId: viewId ?? 'default',
      }
    }

    return {
      tableName: this.requireNonEmptyString(tableNameOrParams.tableName, `${methodName}.tableName`),
      viewId: tableNameOrParams.viewId ?? 'default',
    }
  }

  private normalizeRequiredViewSelectorArgs(
    tableNameOrParams: string | DataSetCrudToolDeleteViewParams,
    viewId: string | undefined,
    methodName: string,
  ): DataSetCrudToolDeleteViewParams {
    if (typeof tableNameOrParams === 'string') {
      return {
        tableName: this.requireNonEmptyString(tableNameOrParams, `${methodName}.tableName`),
        viewId: this.requireNonEmptyString(viewId, `${methodName}.viewId`),
      }
    }

    return {
      tableName: this.requireNonEmptyString(tableNameOrParams.tableName, `${methodName}.tableName`),
      viewId: this.requireNonEmptyString(tableNameOrParams.viewId, `${methodName}.viewId`),
    }
  }

  private normalizeCreateViewArgs(
    tableNameOrParams: string | DataSetCrudToolCreateViewParams,
    viewIdOrConfig?: string | IViewMetadata,
    config?: IViewMetadata,
  ): DataSetCrudToolCreateViewParams {
    if (typeof tableNameOrParams === 'string') {
      return {
        tableName: this.requireNonEmptyString(tableNameOrParams, 'createView.tableName'),
        viewId: this.requireNonEmptyString(
          typeof viewIdOrConfig === 'string' ? viewIdOrConfig : undefined,
          'createView.viewId',
        ),
        ...(viewIdOrConfig !== undefined && typeof viewIdOrConfig !== 'string'
          ? { config: this.requireObjectArg(viewIdOrConfig, 'createView.config') }
          : config !== undefined
            ? { config: this.requireObjectArg(config, 'createView.config') }
            : {}),
      }
    }

    return {
      tableName: this.requireNonEmptyString(tableNameOrParams.tableName, 'createView.tableName'),
      viewId: this.requireNonEmptyString(tableNameOrParams.viewId, 'createView.viewId'),
      ...(tableNameOrParams.config !== undefined
        ? { config: this.requireObjectArg(tableNameOrParams.config, 'createView.config') }
        : {}),
    }
  }

  private normalizeUpdateViewArgs(
    tableNameOrParams: string | DataSetCrudToolUpdateViewParams,
    viewIdOrUpdates?: string | Partial<IViewMetadata>,
    maybeUpdates?: Partial<IViewMetadata>,
  ): Required<DataSetCrudToolUpdateViewParams> {
    if (typeof tableNameOrParams === 'string') {
      return {
        tableName: this.requireNonEmptyString(tableNameOrParams, 'updateView.tableName'),
        viewId: this.requireNonEmptyString(
          typeof viewIdOrUpdates === 'string' ? viewIdOrUpdates : undefined,
          'updateView.viewId',
        ),
        updates: this.requireObjectArg(maybeUpdates, 'updateView.updates'),
      }
    }

    return {
      tableName: this.requireNonEmptyString(tableNameOrParams.tableName, 'updateView.tableName'),
      viewId: tableNameOrParams.viewId ?? 'default',
      updates: this.requireObjectArg(tableNameOrParams.updates, 'updateView.updates'),
    }
  }

  private normalizeRowSelectorArgs(
    tableNameOrParams: string | DataSetCrudToolRowSelector,
    idOrViewId: string | number | undefined,
    viewId: string | undefined,
    methodName: string,
  ): Required<DataSetCrudToolRowSelector> {
    if (typeof tableNameOrParams === 'string') {
      if (typeof idOrViewId !== 'string' && typeof idOrViewId !== 'number') {
        throw new Error(`${methodName}.id must be a string or number`)
      }

      return {
        tableName: this.requireNonEmptyString(tableNameOrParams, `${methodName}.tableName`),
        id: idOrViewId,
        viewId: viewId ?? 'default',
      }
    }

    return {
      tableName: this.requireNonEmptyString(tableNameOrParams.tableName, `${methodName}.tableName`),
      id: tableNameOrParams.id,
      viewId: tableNameOrParams.viewId ?? 'default',
    }
  }

  private normalizeCreateRowArgs(
    tableNameOrParams: string | DataSetCrudToolCreateRowParams,
    data: Partial<IDataRow> | undefined,
    viewId: string | undefined,
  ): Required<DataSetCrudToolCreateRowParams> {
    if (typeof tableNameOrParams === 'string') {
      return {
        tableName: this.requireNonEmptyString(tableNameOrParams, 'createRow.tableName'),
        data: this.requireObjectArg(data, 'createRow.data'),
        viewId: viewId ?? 'default',
      }
    }

    return {
      tableName: this.requireNonEmptyString(tableNameOrParams.tableName, 'createRow.tableName'),
      data: this.requireObjectArg(tableNameOrParams.data, 'createRow.data'),
      viewId: tableNameOrParams.viewId ?? 'default',
    }
  }

  private normalizeUpdateRowArgs(
    tableNameOrParams: string | DataSetCrudToolUpdateRowParams,
    idOrData?: string | number | Partial<IDataRow>,
    dataOrViewId?: Partial<IDataRow> | string,
    viewId?: string,
  ): Required<DataSetCrudToolUpdateRowParams> {
    if (typeof tableNameOrParams === 'string') {
      if (typeof idOrData !== 'string' && typeof idOrData !== 'number') {
        throw new Error('updateRow.id must be a string or number')
      }

      return {
        tableName: this.requireNonEmptyString(tableNameOrParams, 'updateRow.tableName'),
        id: idOrData,
        data: this.requireObjectArg(
          typeof dataOrViewId === 'string' ? undefined : dataOrViewId,
          'updateRow.data',
        ),
        viewId: typeof dataOrViewId === 'string' ? dataOrViewId : (viewId ?? 'default'),
      }
    }

    return {
      tableName: this.requireNonEmptyString(tableNameOrParams.tableName, 'updateRow.tableName'),
      id: tableNameOrParams.id,
      data: this.requireObjectArg(tableNameOrParams.data, 'updateRow.data'),
      viewId: tableNameOrParams.viewId ?? 'default',
    }
  }

  private normalizeUpdateRelationArgs(
    selectorOrParams: RelationSelector | DataSetCrudToolUpdateRelationParams,
    updates?: Partial<TableRelation>,
  ): DataSetCrudToolUpdateRelationParams {
    if ('selector' in selectorOrParams) {
      return {
        selector: selectorOrParams.selector,
        updates: this.requireObjectArg(selectorOrParams.updates, 'updateRelation.updates'),
      }
    }

    return {
      selector: selectorOrParams,
      updates: this.requireObjectArg(updates, 'updateRelation.updates'),
    }
  }

  private normalizeDependencySelectorArgs(
    parentTableOrParams: string | DataSetCrudToolDependencySelector,
    childTable: string | undefined,
    methodName: string,
  ): DataSetCrudToolDependencySelector {
    if (typeof parentTableOrParams === 'string') {
      return {
        parentTable: this.requireNonEmptyString(parentTableOrParams, `${methodName}.parentTable`),
        childTable: this.requireNonEmptyString(childTable, `${methodName}.childTable`),
      }
    }

    return {
      parentTable: this.requireNonEmptyString(parentTableOrParams.parentTable, `${methodName}.parentTable`),
      childTable: this.requireNonEmptyString(parentTableOrParams.childTable, `${methodName}.childTable`),
    }
  }

  private normalizeUpdateDependencyArgs(
    parentTableOrParams: string | DataSetCrudToolUpdateDependencyParams,
    childTableOrUpdates?: string | Partial<ViewDependency>,
    updates?: Partial<ViewDependency>,
  ): DataSetCrudToolUpdateDependencyParams {
    if (typeof parentTableOrParams === 'string') {
      return {
        parentTable: this.requireNonEmptyString(parentTableOrParams, 'updateDependency.parentTable'),
        childTable: this.requireNonEmptyString(
          typeof childTableOrUpdates === 'string' ? childTableOrUpdates : undefined,
          'updateDependency.childTable',
        ),
        updates: this.requireObjectArg(updates, 'updateDependency.updates'),
      }
    }

    return {
      parentTable: this.requireNonEmptyString(parentTableOrParams.parentTable, 'updateDependency.parentTable'),
      childTable: this.requireNonEmptyString(parentTableOrParams.childTable, 'updateDependency.childTable'),
      updates: this.requireObjectArg(parentTableOrParams.updates, 'updateDependency.updates'),
    }
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

  /**
   * 给数据表写入资源语义元数据。
   *
   * 这些字段只描述“资源身份”和“业务角色”，不参与运行时行为判断。
   */
  private applyTableSemanticMetadata(table: DataTable, metadata: TableSemanticMetadata): void {
    if (metadata.resourceType !== undefined) {
      table.resourceType = metadata.resourceType
    }
    if (metadata.resourceId !== undefined) {
      table.resourceId = metadata.resourceId
    }
    if (metadata.businessCategory !== undefined) {
      table.businessCategory = metadata.businessCategory
    }
  }

  /**
   * 更新数据表的资源语义元数据。
   *
   * updateTable 允许用 null 显式清空已有字段，方便建模工具做重分类或解绑。
   */
  private applyTableSemanticMetadataUpdates(
    table: DataTable,
    updates: Pick<DataSetCrudToolUpdateTableOptions, 'resourceType' | 'resourceId' | 'businessCategory'>,
  ): void {
    if (updates.resourceType !== undefined) {
      if (updates.resourceType === null) {
        delete table.resourceType
      } else {
        table.resourceType = updates.resourceType
      }
    }

    if (updates.resourceId !== undefined) {
      if (updates.resourceId === null) {
        delete table.resourceId
      } else {
        table.resourceId = updates.resourceId
      }
    }

    if (updates.businessCategory !== undefined) {
      if (updates.businessCategory === null) {
        delete table.businessCategory
      } else {
        table.businessCategory = updates.businessCategory
      }
    }
  }

  /**
   * 获取单条表关系；不存在时抛错。
   *
   * @param selector 关系选择器。
   * @returns 表关系。
   * @throws 当关系不存在时抛错。
   */
  private getRelationOrThrow(selector: RelationSelector): TableRelation {
    const relation = this.getRelation(selector)
    if (!relation) {
      throw new Error(`Relation "${selector.parentTable}→${selector.childTable}" not found`)
    }
    return relation
  }

  /**
   * 获取单条视图依赖；不存在时抛错。
   *
   * @param parentTable 父表名。
   * @param childTable 子表名。
   * @returns 视图依赖。
   * @throws 当依赖不存在时抛错。
   */
  private getDependencyOrThrow(parentTable: string, childTable: string): ViewDependency {
    const dependency = this.getDependency(parentTable, childTable)
    if (!dependency) {
      throw new Error(`Dependency "${parentTable}→${childTable}" not found`)
    }
    return dependency
  }

  /**
   * 按 selector 筛选关系集合。
   *
   * @param selector 关系选择器。
   * @returns 命中的关系列表。
   */
  private findRelations(selector: RelationSelector): TableRelation[] {
    return (this.dataSet.tableRelations ?? []).filter((relation) => {
      if (relation.parentTable !== selector.parentTable || relation.childTable !== selector.childTable) return false
      if (selector.parentField !== undefined && relation.parentField !== selector.parentField) return false
      if (selector.childField !== undefined && relation.childField !== selector.childField) return false
      return true
    })
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