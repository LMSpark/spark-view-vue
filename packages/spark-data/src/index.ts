/**
 * @spark-view/spark-data
 * SPARK 数据空间 — 数据模型 + 权限系统
 */

// ===== 命名空间 API =====

/** 推荐使用的命名空间API */
export { SparkData } from './spark-data'

// ===== 核心类导出 =====

/** 核心数据类 */
export { DataSet, DataTable, DataView, TreeManager } from './spark-data'

// ===== CRUD 服务 =====

/** CRUD 服务相关导出 */
export { CrudService, createCrudService, defaultCrudService } from './crud-service'
export type { CrudResult, QueryParams, BatchResult, CrudOperationConfig } from './types'

// ===== 数据类型定义 =====

/** 核心数据类型 */
export type {
  IDataRow,
  IDataSource,
  IInstancePermission,
  IModelPermission,
  EventCallback,
  RequestConfig,
  ApiResponse,
  IDataTable,
  ITableMetadata,
  IDataSet,
  IDataSetMetadata,
  IDataSetConfig,
  ITreeManager,
  IDataView,
  IViewMetadata,
  FilterExpression,
  SortExpression,
  TreeConfig,
  FlatTreeNode,
  HttpEndpoint,
  CrudApi,
  DataColumn,
  DataRelation
} from './types'

/** 权限和字段常量 */
export {
  INSTANCE_PERMISSION_FIELD,
  MODEL_PERMISSION_FIELD,
  FieldVisibility,
  ComponentLevel
} from './types'

// ===== 权限系统 =====

/** 权限检查器 */
export {
  PermissionChecker, createPermissionChecker, checkPermission, resetPermissionChecker,
  PermissionFilter, createPermissionFilter, filterByPermission, resetPermissionFilter,
  FieldRenderHelper, createFieldRenderHelper, resetFieldRenderHelper,
  computeFieldState, computeFieldStates, filterVisibleFields
} from './permission/index.js'

/** 权限相关类型 */
export type {
  IFieldRenderConfig, IFieldRenderState, IFieldRenderHelper
} from './permission/index.js'

// ===== 工具函数 =====

/** 工具函数 */
export { rowsEqual, isSameRow } from './core/utils'
