/**
 * @spark-view/spark-data
 * SPARK 数据空间 — 数据模型 + 权限系统
 */

// ===== 命名空间 API =====

export { SparkData } from './spark-data'

// ===== 核心类导出 =====

export { DataSet } from './dataset'
export { DataTable } from './data-table'
export { DataView } from './data-view'
export { TreeManager } from './tree-manager'

// ===== 枚举 / 常量 =====

export { RequestState } from './types'

// ===== CRUD 服务 =====

export { CrudService, createCrudService } from './crud-service'
export { createCrudLifecycleEvent } from './strategies/types'
export type { CrudResult, QueryParams, BatchResult, CrudOperationConfig } from './types'
export type {
  CrudOperation, CrudLifecycleEvent
} from './strategies/types'

// ===== 数据类型定义 =====

export type {
  IDataRow,
  IDataSource,
  IInstancePermission,
  IModelPermission,
  ITableOwnMetadata,
  ITableMetadata,
  IDataSet,
  IDataSetMetadata,
  IViewMetadata,
  FilterExpression,
  FilterOperator,
  SortExpression,
  SortDirection,
  TreeConfig,
  TreeApi,
  FlatTreeNode,
  NestedTreeNode,
  NestedTreeSearchResult,
  TreePath,
  HttpEndpoint,
  CrudApi,
  DataColumn,
  DataRelation,
  ViewChangeHandlers,
  DependencyType,
  ComputedColumnFn,
} from './types'

// ===== 主键生成器 =====

export { 
  PrimaryKeyGenerator, 
  createPrimaryKeyGenerator 
} from './core/primary-key-generator'
export type { 
  PrimaryKeyStrategy, 
  PrimaryKeyGeneratorConfig 
} from './core/primary-key-generator'

// ===== 计算列表达式 =====

export { compileExpression, compileColumnsExpressions } from './strategies/computed-column-delegate'
export type { ComputedColumnContext, AggregateResolver } from './strategies/computed-column-delegate'

// ===== DataKey 统一解析 =====

export { isDataKey, parseDataKey, resolveDataKey, resolveDataKeyBinding, resolveRawKey, getViewFromRawKey, buildDataKey, getViewKey } from './core/data-key'
export type { DataKeyDescriptor, DataKeyField, DataKeyBinding } from './core/data-key'

// ===== 能力键 =====

export { PAGE_DATASET, DATA_SOURCE } from './capability-keys'

export {
  INSTANCE_PERMISSION_FIELD,
  MODEL_PERMISSION_FIELD,
  FieldVisibility,
  ComponentLevel
} from './types'

// ===== 权限系统 =====

export {
  PermissionChecker, createPermissionChecker, checkPermission,
  PermissionFilter, createPermissionFilter, filterByPermission,
  FieldRenderHelper, createFieldRenderHelper,
  computeFieldState, computeFieldStates, filterVisibleFields
} from './permission/index'

export type {
  IFieldRenderConfig, IFieldRenderState, IFieldRenderHelper
} from './permission/index'

// ===== 验证系统 =====

export {
  DataValidator,
  createValidator,
  createSchema
} from './validation'
export type {
  ValidationError,
  ValidationResult,
  RowValidator,
  DataSchema
} from './validation'

// ===== 工具函数 =====

export { isSameRow } from './core/utils'
