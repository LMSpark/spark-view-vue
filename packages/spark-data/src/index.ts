/**
 * @spark-view/spark-data
 * SPARK 数据空间 — 数据模型 + 权限系统
 */

// ===== 命名空间 API =====

export { SparkData } from './spark-data'

// ===== 核心类导出 =====

export { DataSet, DataTable, DataView, TreeManager } from './spark-data'

// ===== 枚举 / 常量 =====

export { RequestState } from './data-view'

// ===== CRUD 服务 =====

export { CrudService, createCrudService } from './crud-service'
export type { CrudResult, QueryParams, BatchResult, CrudOperationConfig } from './types'

// ===== 数据类型定义 =====

export type {
  IDataRow,
  IDataSource,
  IInstancePermission,
  IModelPermission,
  ITableMetadata,
  IDataSet,
  IDataSetMetadata,
  IViewMetadata,
  FilterExpression,
  SortExpression,
  TreeConfig,
  FlatTreeNode,
  HttpEndpoint,
  CrudApi,
  DataColumn,
  DataRelation,
  ViewStateEvent,
  DependencyType
} from './types'

// ===== DataKey 统一解析 =====

export { isDataKey, parseDataKey, resolveDataKey, resolveDataKeyAsSource, resolveDataKeyBinding, resolveRawKey, getViewFromRawKey, buildDataKey, getViewKey } from './core/data-key'
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
  PermissionChecker, createPermissionChecker, checkPermission, resetPermissionChecker,
  PermissionFilter, createPermissionFilter, filterByPermission, resetPermissionFilter,
  FieldRenderHelper, createFieldRenderHelper, resetFieldRenderHelper,
  computeFieldState, computeFieldStates, filterVisibleFields
} from './permission/index'

export type {
  IFieldRenderConfig, IFieldRenderState, IFieldRenderHelper
} from './permission/index'

// ===== 工具函数 =====

export { isSameRow, getParentRows } from './core/utils'

// ===== DataSet 同步辅助 =====
// UI ↔ DataSet 双向同步的高层 API（渲染层消费）

export { createTableSyncHandlers, subscribeViewStateChanges } from './sync-helpers'
export type { TableSyncHandlers, ViewStateChangeCallback } from './sync-helpers'

// ===== Vue Composables =====
// DataSet 生命周期管理（需要 Vue 3.5+）

export { usePageDataSet } from './composables/index'
export type { UsePageDataSetOptions, UsePageDataSetReturn } from './composables/index'
