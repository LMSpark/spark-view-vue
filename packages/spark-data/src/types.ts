/**
 * SPARK 数据空间类型定义
 */

import type {
  IDataRow as IDataRowBase,
  IDataSource,
  IDataRowWithPermission,
  IModelPermission,
  IInstancePermission,
  HttpRequestConfig,
  ApiResponse,
  EventCallback
} from '@spark-view/spark-utils'

export type IDataRow = IDataRowBase
export type {
  HttpRequestConfig,
  IDataSource,
  IDataRowWithPermission,
  IModelPermission,
  IInstancePermission,
  ApiResponse,
  EventCallback
}

// ==================== 基础类型 ====================

export interface IViewMetadata {
  hostTable?: string
  contextId?: string
  filterExpression?: FilterExpression
  sortExpression?: SortExpression
  autoSelectFirst?: boolean
  page?: number
  pageSize?: number
}

export interface IDataView extends IViewMetadata, IDataSource {
  hostTable: string
  contextId: string
  page: number
  pageSize: number
  currentRow: IDataRowWithPermission | null
  currentRowIndex: number | null
  selectedRows: IDataRowWithPermission[]
  selectedRowIndices: number[]
  rows: IDataRowWithPermission[]
  originalRows?: IDataRowWithPermission[]
  total: number
  setCurrentRow(row: IDataRowWithPermission | null, skipNotify?: boolean): void
  setSelectedRows(rows: IDataRowWithPermission[], skipNotify?: boolean): void
  toData(): IViewMetadata
}

export interface DataColumn {
  name: string
  type: string
  label?: string
  allowDBNull?: boolean
  defaultValue?: unknown
  isPrimaryKey?: boolean
  autoIncrement?: boolean
}

// ==================== API 类型 ====================

export type HttpEndpoint = Omit<HttpRequestConfig,
  | 'timeout' | 'responseType' | 'cache' | 'cacheKey' | 'cacheExpiry'
  | 'retry' | 'retryDelay' | 'skipRequestInterceptor' | 'skipResponseInterceptor'
  | 'meta'
  | 'data' | 'token'
>

export interface CrudApi {
  create?: HttpEndpoint
  retrieve?: HttpEndpoint
  update?: HttpEndpoint
  delete?: HttpEndpoint
  list?: HttpEndpoint & {
    pagination?: {
      pageParam?: string
      sizeParam?: string
      sortParam?: string
    }
  }
  batch?: {
    create?: HttpEndpoint
    update?: HttpEndpoint
    delete?: HttpEndpoint
  }
  import?: HttpEndpoint
  export?: HttpEndpoint
}

export type PagedDataResponse = ApiResponse<IDataSource>
export type SingleDataResponse<T = Record<string, unknown>> = ApiResponse<IDataRowWithPermission<T>>

// ==================== DataTable 类型 ====================

export interface ITableMetadata extends IViewMetadata {
  tableName: string
  columns: DataColumn[]
  rows?: IDataRow[]
  api?: CrudApi
  contexts?: Record<string, IViewMetadata>
  loading?: boolean
  error?: string
}

export interface IDataTable extends IDataView {
  tableName: string
  columns: DataColumn[]
  api?: CrudApi
  contexts?: Record<string, IDataView>
}

// ==================== 过滤和排序类型 ====================

export type DependencyType =
  | 'currentRow'
  | 'selectedRows'
  | 'allRows'
  | 'pagedRows'
  | string

export type SortDirection = 'asc' | 'desc' | 'ASC' | 'DESC'

export type SortExpression =
  | { field: string; direction: SortDirection }
  | { fields: Array<{ field: string; direction: SortDirection }> }

export type FilterOperator =
  | '==' | '!=' | '>' | '>=' | '<' | '<='
  | 'in' | 'not in' | 'like' | 'not like'
  | 'is null' | 'is not null'
  | 'between' | 'not between'
  | 'startsWith' | 'endsWith' | 'contains'

export type FilterExpression =
  | { field: string; op: FilterOperator; value: unknown }
  | { type: 'and' | 'or'; children: FilterExpression[] }
  | { type: '!condition'; field: string; op: FilterOperator; value: unknown }
  | { type: '!and' | '!or'; children: FilterExpression[] }
  | { func: string; args: unknown[] }

// ==================== 关系类型 ====================

export interface DataRelation {
  parentTable: string
  parentContextId?: string
  childTable: string
  childContextId?: string
  dependencyType: DependencyType
  filterExpression: FilterExpression
  cascadeUpdate?: boolean
  cascadeDelete?: boolean
  autoLoad?: boolean
  relationName?: string
}

// ==================== DataSet 类型 ====================

export interface IDataSetMetadata {
  dataSetName: string
  tables: Record<string, ITableMetadata>
  relations?: DataRelation[]
  version?: number
  pageId?: string
}

export interface IDataSet extends IDataSetMetadata {
  tables: Record<string, IDataTable>
  autoLoadRelations?: boolean
  getTable(tableName: string): IDataTable | undefined
  requestTableData(tableName: string): void
  updateRelatedTables(tableName: string, contextId?: string): void
  notifySubscribers(tableName: string, contextId?: string): void
  subscribe(tableName: string, contextId: string, callback: () => void): () => void
  on(event: string, handler: EventCallback): void
  off(event: string, handler: EventCallback): void
  emit(event: string, data: unknown): void
  toData(): IDataSetMetadata
  toJSON(): string
}

export interface IDataSetConfig extends IDataSetMetadata {
  dataLoader?: (tableName: string) => Promise<IDataRow[]>
  autoLoadRelations?: boolean
}

// ==================== 树类型 ====================

export interface TreeConfig {
  mode: 'flat' | 'nested'
  tableName?: string
  idField?: string
  parentIdField?: string
  textField?: string
  depthLimit?: number
  lazy?: boolean
}

export interface FlatTreeNode {
  id: string | number
  parentId?: string | number | null
  name: string
  level?: number
  hasChildren?: boolean
  isLoaded?: boolean
  [key: string]: unknown
}

export interface NestedTreeNode extends FlatTreeNode {
  children: NestedTreeNode[]
}

export type FlatTreeCache = Record<string | number, FlatTreeNode>

export interface TreePath {
  pathIds: Array<string | number>
  pathNodes?: FlatTreeNode[]
}

export interface ITreeManager {
  setDataView(context: IDataView): void
  getDataView(): IDataView | undefined
  getConfig(): TreeConfig
  getCache(): FlatTreeCache
  addNodesToCache(nodes: FlatTreeNode[]): void
  getNode(id: string | number): FlatTreeNode | undefined
  getChildren(parentId: string | number | null): FlatTreeNode[]
  getRoots(): FlatTreeNode[]
  buildNestedTree(rootId?: string | number | null): NestedTreeNode[]
  enrichNodes(): void
  on(event: string, callback: EventCallback): void
  off(event: string, callback: EventCallback): void
}


