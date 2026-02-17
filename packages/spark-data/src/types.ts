/**
 * SPARK 数据空间类型定义
 *
 * 数据模型、权限、过滤/排序、关系、树 的唯一类型源
 */

import type { RequestConfig, ApiResponse } from '@spark-view/spark-utils'

export type { RequestConfig, ApiResponse }

// ===== 视图状态事件 =====

/** 视图状态变化事件 */
export interface ViewStateEvent {
  tableName: string
  viewId: string
  changeType: 'currentRow' | 'selectedRows' | 'cleared'
  row?: IDataRow | null
  rows?: IDataRow[]
}

// ===== 权限类型 =====

/**
 * 实例级权限（行级）- 服务端权限快照
 *
 * 采用类似JWT的设计理念，权限信息由服务端一次性计算并返回前端，
 * 前端保存权限快照，在数据更新时回传给服务端，避免重复计算。
 */
export interface IInstancePermission {
  allowDelete?: boolean
  editableFields?: string[]
  hiddenFields?: string[]
  maskedFields?: string[]

  // ===== 权限快照 =====
  permissionToken?: string  // 权限令牌（后端验证有效性）
}

/**
 * 模型级权限（表级）- 服务端权限快照
 *
 * 权限信息在首次数据加载时由服务端计算并缓存，
 * 前端负责维护和传递权限状态。
 */
export interface IModelPermission {
  allowCreate?: boolean
  allowImport?: boolean
  allowExport?: boolean

  // ===== 权限快照 =====
  permissionToken?: string  // 权限令牌（后端验证有效性）
}

/** 实例权限字段名 */
export const INSTANCE_PERMISSION_FIELD = '_perm' as const

/** 模型权限字段名 */
export const MODEL_PERMISSION_FIELD = '_modelPerm' as const

/** 字段可见性枚举 */
export enum FieldVisibility {
  Visible = 'visible',
  Masked = 'masked',
  Hidden = 'hidden'
}

/** 组件级别枚举 */
export enum ComponentLevel {
  Model = 'model',
  Instance = 'instance',
  Field = 'field'
}

// ===== 基础数据类型 =====

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

// ===== 数据模型类型 =====

/** 数据列定义 */
export interface DataColumn {
  name: string
  type: string
  label?: string
  allowDBNull?: boolean
  defaultValue?: unknown
  isPrimaryKey?: boolean
  autoIncrement?: boolean

  // ===== 计算字段属性 =====

  /** 计算表达式（JSON格式，如 {"op": "+", "left": "field1", "right": "field2"}） */
  computeExpression?: unknown
}

/** CRUD API配置 */
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

/** HTTP端点定义 */
export interface HttpEndpoint {
  /** 请求URL */
  url: string
  /** HTTP方法 */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** 请求头 */
  headers?: Record<string, string>
  /** URL查询参数 */
  params?: Record<string, unknown>
  /** URL路径参数 */
  pathParams?: string[]
  /** API基础地址 */
  baseURL?: string
}

// ===== 序列化接口 =====

/** 数据视图元数据 */
export interface IViewMetadata {
  tableName: string | undefined
  viewId: string | "default" | undefined
  rows: IDataRow[] | undefined
  filterExpression: FilterExpression | undefined
  sortExpression: SortExpression | undefined
  autoSelectFirst: boolean | undefined
  page: number | undefined
  pageSize: number | undefined
}

/** 数据表元数据 */
export interface ITableMetadata extends IViewMetadata {
  tableName: string
  columns: DataColumn[]
  api: CrudApi | undefined
  views: Record<string, IViewMetadata> | undefined
  loading: boolean | undefined
  error: string | undefined
}

/** 数据集元数据 */
export interface IDataSetMetadata {
  dataSetName: string
  tables: Record<string, ITableMetadata>
  relations: DataRelation[] | undefined
  version: number | undefined
  pageId: string | undefined
}

// ===== 过滤和排序类型 =====

/** 依赖类型 */
export type DependencyType =
  | 'currentRow'
  | 'selectedRows'
  | 'allRows'
  | 'pagedRows'
  | string

/** 排序方向 */
export type SortDirection = 'asc' | 'desc' | 'ASC' | 'DESC'

/** 排序表达式 */
export type SortExpression =
  | { field: string; direction: SortDirection }
  | { fields: Array<{ field: string; direction: SortDirection }> }

/** 过滤操作符 */
export type FilterOperator =
  | '==' | '!=' | '>' | '>=' | '<' | '<='
  | 'in' | 'not in' | 'like' | 'not like'
  | 'is null' | 'is not null'
  | 'between' | 'not between'
  | 'startsWith' | 'endsWith' | 'contains'

/** 过滤表达式 */
export type FilterExpression =
  | { field: string; op: FilterOperator; value: unknown }
  | { type: 'and' | 'or'; children: FilterExpression[] }
  | { type: '!condition'; field: string; op: FilterOperator; value: unknown }
  | { type: '!and' | '!or'; children: FilterExpression[] }
  | { func: string; args: unknown[] }

// ===== 关系类型 =====

/** 数据关系定义 */
export interface DataRelation {
  parentTable: string
  parentViewId?: string
  childTable: string
  childViewId?: string
  dependencyType: DependencyType
  filterExpression: FilterExpression
  cascadeUpdate?: boolean
  cascadeDelete?: boolean
  autoLoad?: boolean
  relationName?: string
}

// ===== 树类型 =====

/** 树配置 */
export interface TreeConfig {
  mode: 'flat' | 'nested'
  tableName?: string
  idField?: string
  parentIdField?: string
  textField?: string
  depthLimit?: number
  lazy?: boolean
}

/** 平面树节点 */
export interface FlatTreeNode {
  id: string | number
  parentId?: string | number | null
  name: string
  level?: number
  hasChildren?: boolean
  isLoaded?: boolean
  [key: string]: unknown
}

/** 嵌套树节点 */
export interface NestedTreeNode extends FlatTreeNode {
  children: NestedTreeNode[]
}

/** 树路径 */
export interface TreePath {
  pathIds: Array<string | number>
  pathNodes?: FlatTreeNode[]
}

// ===== 响应类型别名 =====

/** 数据集类型别名 */
export type IDataSet = import('./dataset').DataSet

// ===== CRUD服务相关类型 =====

/**
 * CRUD操作结果
 */
export interface CrudResult<T = unknown> {
  success: boolean
  data?: T
  error?: Error
  message?: string
  code?: string
  timestamp?: number
}

/**
 * 分页查询参数 - 支持权限快照传递
 */
export interface QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  filter?: Record<string, unknown> | FilterExpression
  search?: string
  fields?: string[]  // 要查询的字段列表
  include?: string[] // 要包含的关联数据

  // ===== 权限快照利用 =====
  modelPermission?: IModelPermission       // 完整的模型级权限对象（用于提取权限令牌）
  instancePermission?: IInstancePermission // 完整的实例级权限对象（用于提取权限令牌）

  [key: string]: unknown
}

/**
 * 批量操作结果
 */
export interface BatchResult {
  successCount: number
  failureCount: number
  results: CrudResult[]
  errors: Error[]
  totalTime?: number
}

/**
 * CRUD操作配置 - 集成权限快照利用
 */
export interface CrudOperationConfig {
  timeout?: number
  retryCount?: number
  skipPermissionCheck?: boolean

  // ===== 权限快照利用 =====
  modelPermission?: IModelPermission       // 完整的模型级权限对象（用于提取权限令牌）
  instancePermission?: IInstancePermission // 完整的实例级权限对象（用于提取权限令牌）

  // ===== 数据处理 =====
  validateData?: boolean
  transformRequest?: (data: unknown) => unknown
  transformResponse?: (data: unknown) => unknown
}
