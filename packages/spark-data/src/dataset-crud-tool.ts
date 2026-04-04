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
} from './types'

/**
 * 创建数据表时的输入参数。
 */
export interface DataSetCrudToolCreateTableOptions {
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

/**
 * 创建视图依赖所需参数。
 */
type CreateDependencyParams = {
  parentTable: string
  childTable: string
  dependencyType?: DependencyType | undefined
  autoLoad?: boolean
}

/**
 * DataSet 级统一 CRUD facade。
 *
 * 设计目标：
 * 1. 构造时只要求 dataSetName，外部无需先手动拼装 DataSet。
 * 2. 统一收口表、列、视图、行、关系、依赖这几类对象的常用操作。
 * 3. 全部复用现有 DataSet/DataTable/DataView 能力，避免再造第二套状态模型。
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
    this.dataSet = DataSet.fromConfig({
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
  toData(): IDataSetMetadata {
    return this.dataSet.toData()
  }

  /**
   * 将当前 DataSet 序列化为 JSON 友好的对象。
   *
   * @returns DataSet 元数据对象。
   */
  toJSON(): IDataSetMetadata {
    return this.dataSet.toJSON()
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
  getTable(tableName: string): DataTable | undefined {
    return this.dataSet.getTable(tableName)
  }

  /**
   * 列出指定数据表的全部列定义。
   *
   * @param tableName 表名。
   * @returns 列定义副本列表。
   * @throws 当表不存在时抛错。
   */
  listColumns(tableName: string): DataColumn[] {
    return [...this.getTableOrThrow(tableName).columns]
  }

  /**
   * 获取指定数据表中的单个列定义。
   *
   * @param tableName 表名。
   * @param columnName 列名。
   * @returns 命中的列定义；不存在时返回 undefined。
   * @throws 当表不存在时抛错。
   */
  getColumn(tableName: string, columnName: string): DataColumn | undefined {
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
  createColumn(tableName: string, column: DataColumn): DataTable {
    // 必须走 DataTable.addColumns，不能直接改 metadata，否则 validator / view 列缓存会失效。
    const table = this.getTableOrThrow(tableName)
    table.addColumns([column])
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
  updateColumn(tableName: string, columnName: string, updates: Partial<DataColumn>): DataTable {
    // 列更新后会触发 DataTable 内部运行时刷新链，保证 DataView.getColumn 与 schema 保持一致。
    const table = this.getTableOrThrow(tableName)
    table.updateColumn(columnName, updates)
    return table
  }

  /**
   * 删除指定列。
   *
   * @param tableName 表名。
   * @param columnName 列名。
   * @throws 当表或列不存在时抛错。
   */
  deleteColumn(tableName: string, columnName: string): void {
    this.getTableOrThrow(tableName).removeColumn(columnName)
  }

  /**
   * 创建数据表并按需初始化 API、CRUD 配置和视图。
   *
   * @param options 建表参数。
   * @returns 新创建的数据表实例。
   * @throws 当表已存在或配置非法时抛错。
   */
  createTable(options: DataSetCrudToolCreateTableOptions): DataTable {
    const table = this.dataSet.addTable(options.tableName, options.columns)

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
   * 更新数据表结构及运行配置。
   *
   * @param tableName 表名。
   * @param updates 更新内容。
   * @returns 更新后的 DataTable。
   * @throws 当表不存在或某项结构更新非法时抛错。
   */
  updateTable(tableName: string, updates: DataSetCrudToolUpdateTableOptions): DataTable {
    const table = this.getTableOrThrow(tableName)

    // 结构变更优先执行，避免后续 rows / api / crudConfig 更新面对旧 schema。
    if (updates.columnsToAdd?.length) {
      table.addColumns(updates.columnsToAdd)
    }
    if (updates.columnUpdates?.length) {
      for (const entry of updates.columnUpdates) {
        table.updateColumn(entry.columnName, entry.updates)
      }
    }
    if (updates.columnsToRemove?.length) {
      for (const columnName of updates.columnsToRemove) {
        table.removeColumn(columnName)
      }
    }
    if (updates.api !== undefined) {
      table.setApi(updates.api)
    }
    if (updates.crudConfig !== undefined) {
      if (updates.crudConfig === null) {
        delete table.crudConfig
      } else {
        table.setCrudConfig(updates.crudConfig)
      }
    }
    if (updates.defaultRows !== undefined) {
      table.rows = [...updates.defaultRows]
      table.getView('default')?.replaceRows([...updates.defaultRows])
    }

    return table
  }

  /**
   * 删除指定数据表。
   *
   * @param tableName 表名。
   * @throws 当表不存在，或仍被 relation / dependency 引用时抛错。
   */
  deleteTable(tableName: string): void {
    this.dataSetContract.removeTable(tableName)
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
  listViews(tableName: string): DataView[] {
    return Object.values(this.getTableOrThrow(tableName).views)
  }

  /**
   * 获取指定视图。
   *
   * @param tableName 表名。
   * @param viewId 视图 ID，默认 default。
   * @returns 视图实例；不存在时返回 undefined。
   */
  getView(tableName: string, viewId = 'default'): DataView | undefined {
    return this.dataSet.getView(tableName, viewId)
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
  createView(tableName: string, viewId: string, config?: IViewMetadata): DataView {
    // default 视图在建表时就存在，单独创建会破坏约定，因此强制改走 updateView。
    if (viewId === 'default') {
      throw new Error('Default view already exists, use updateView instead')
    }

    const table = this.getTableOrThrow(tableName)
    const view = table.addView(viewId)
    if (config) {
      this.applyViewMetadata(table, view, config)
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
  updateView(tableName: string, viewId: string, updates: Partial<IViewMetadata>): DataView {
    const table = this.getTableOrThrow(tableName)
    const view = this.getViewOrThrow(tableName, viewId)
    this.applyViewMetadata(table, view, updates)
    return view
  }

  /**
   * 删除指定视图。
   *
   * @param tableName 表名。
   * @param viewId 视图 ID。
   * @throws 当表不存在，或试图删除 default 视图时抛错。
   */
  deleteView(tableName: string, viewId: string): void {
    // default 视图是 DataTable 基础组成部分，不允许删除。
    if (viewId === 'default') {
      throw new Error('Default view cannot be deleted')
    }
    this.getTableOrThrow(tableName).destroyView(viewId)
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
  listRows(tableName: string, viewId = 'default'): IDataRow[] {
    return [...this.getViewOrThrow(tableName, viewId).rows]
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
  getRow(tableName: string, id: string | number, viewId = 'default'): IDataRow | undefined {
    const view = this.getViewOrThrow(tableName, viewId)
    // 行查找支持树形 children 递归扫描，避免调用方区分平铺表和树表。
    return this.findRowById(view.rows, id, row => view.getPkKey(row))
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
  async createRow(
    tableName: string,
    data: Partial<IDataRow>,
    viewId = 'default',
  ): Promise<IDataRow | CrudResult<IDataRow>> {
    const table = this.getTableOrThrow(tableName)
    const view = this.getViewOrThrow(tableName, viewId)
    const result = await view.addRow(data)
    // 无远端 API 的 default view 同时承担 DataTable.rows 的静态源数据，需要双向保持一致。
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
  async updateRow(
    tableName: string,
    id: string | number,
    data: Partial<IDataRow>,
    viewId = 'default',
  ): Promise<boolean | CrudResult<IDataRow>> {
    const table = this.getTableOrThrow(tableName)
    const view = this.getViewOrThrow(tableName, viewId)
    const result = await view.editRowById(id, data)
    // 仅同步内联 default view，避免误把远端视图状态反写成静态源数据。
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
  async deleteRow(
    tableName: string,
    id: string | number,
    viewId = 'default',
  ): Promise<boolean | CrudResult<boolean>> {
    const table = this.getTableOrThrow(tableName)
    const view = this.getViewOrThrow(tableName, viewId)
    const result = await view.removeRow(id)
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
  updateRelation(selector: RelationSelector, updates: Partial<TableRelation>): TableRelation {
    return this.dataSetContract.updateRelation(selector, updates)
  }

  /**
   * 删除一条表关系。
   * 支持字段级 selector 和兼容的 parentTable + childTable 两种签名。
   *
   * @param selectorOrParentTable 关系选择器，或 parentTable。
   * @param childTable 当第一个参数为 parentTable 时，需要补充 childTable。
   * @throws 当关系不存在，或按父子表定位但存在多条关系时抛错。
   */
  deleteRelation(selector: RelationSelector): void
  deleteRelation(parentTable: string, childTable: string): void
  deleteRelation(
    selectorOrParentTable: string | RelationSelector,
    childTable?: string,
  ): void {
    if (typeof selectorOrParentTable === 'string') {
      this.dataSet.removeRelation(selectorOrParentTable, childTable ?? '')
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
  getDependency(parentTable: string, childTable: string): ViewDependency | undefined {
    return (this.dataSet.viewDependencies ?? []).find(
      dependency => dependency.parentTable === parentTable && dependency.childTable === childTable,
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
  ): ViewDependency {
    return this.dataSetContract.updateDependency(parentTable, childTable, updates)
  }

  /**
   * 删除一条视图依赖。
   *
   * @param parentTable 父表名。
   * @param childTable 子表名。
   * @throws 当依赖不存在时抛错。
   */
  deleteDependency(parentTable: string, childTable: string): void {
    this.dataSet.removeDependency(parentTable, childTable)
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