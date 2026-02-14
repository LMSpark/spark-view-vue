/**
 * SPARK 数据空间类型定义
 *
 * 数据模型、权限、过滤/排序、关系、树 的唯一类型源
 */

import type { RequestConfig, ApiResponse } from '@spark-view/spark-utils'

export type { RequestConfig, ApiResponse }

// ==================== 事件 ====================

export type EventCallback = (...args: unknown[]) => void

// ==================== 权限类型 ====================

/** 实例级权限（行级） */
export interface IInstancePermission {
  allowDelete?: boolean
  editableFields?: string[]
  hiddenFields?: string[]
  maskedFields?: string[]
}

/** 模型级权限（表级） */
export interface IModelPermission {
  allowCreate?: boolean
  allowImport?: boolean
  allowExport?: boolean
}

/** 实例权限字段名 */
export const INSTANCE_PERMISSION_FIELD = '_perm' as const
/** 模型权限字段名 */
export const MODEL_PERMISSION_FIELD = '_modelPerm' as const

/** 字段可见性 */
export enum FieldVisibility {
  Visible = 'visible',
  Masked = 'masked',
  Hidden = 'hidden'
}

/** 组件级别 */
export enum ComponentLevel {
  Model = 'model',
  Instance = 'instance',
  Field = 'field'
}

// ==================== 基础数据类型 ====================

/** 数据行（带权限） */
export type IDataRow = Record<string, unknown> & {
  _perm?: IInstancePermission
}

/** 数据源（带权限和分页） */
export interface IDataSource {
  rows?: IDataRow[]
  _modelPerm?: IModelPermission
  total?: number
  page?: number
  pageSize?: number
}

// ==================== 基础类型 ====================

export interface DataColumn {
  name: string
  type: string
  label?: string
  allowDBNull?: boolean
  defaultValue?: unknown
  isPrimaryKey?: boolean
  autoIncrement?: boolean
}

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

/** API 端点定义（用于 CrudApi 配置） */
export interface HttpEndpoint {
  /** 请求 URL */
  url: string
  /** HTTP 方法 */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** 请求头 */
  headers?: Record<string, string>
  /** URL 查询参数 */
  params?: Record<string, unknown>
  /** URL 路径参数 */
  pathParams?: string[]
  /** API 基础地址 */
  baseURL?: string
}

// ==================== 序列化接口（只保留必要的） ====================

export interface IViewMetadata {
  hostTable: string | undefined
  contextId: string | "default" | undefined
  rows: IDataRow[] | undefined
  filterExpression: FilterExpression | undefined
  sortExpression: SortExpression | undefined
  autoSelectFirst: boolean | undefined
  page: number | undefined
  pageSize: number | undefined
}

export interface ITableMetadata extends IViewMetadata {
  tableName: string
  columns: DataColumn[]
  api: CrudApi | undefined
  contexts: Record<string, IViewMetadata> | undefined
  loading: boolean | undefined
  error: string | undefined
}

export interface IDataSetMetadata {
  dataSetName: string
  tables: Record<string, ITableMetadata>
  relations: DataRelation[] | undefined
  version: number | undefined
  pageId: string | undefined
}

export interface IDataSetConfig extends IDataSetMetadata {
  dataLoader: ((tableName: string) => Promise<IDataRow[]>) | undefined
  autoLoadRelations: boolean | undefined
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

// ==================== 类型别名 ====================

export type PagedDataResponse = ApiResponse<IDataSource>
export type SingleDataResponse = ApiResponse<IDataRow>

// 向后兼容的类型别名
export type IDataSet = import('./dataset').DataSet
export type IDataTable = import('./data-table').DataTable
export type IDataView = import('./data-view').DataView
export type ITreeManager = import('./tree-manager').TreeManager

// CRUD服务相关类型
export type { CrudResult, QueryParams, BatchResult } from './crud-service'


