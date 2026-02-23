/**
 * @spark-view/spark-data
 * SPARK 数据空间 — 数据模型 + 权限系统
 */

// ===== 命名空间 API =====

export { SparkData } from './spark-data'

// ===== 核心类导出 =====

export { DataSet, DataTable, DataView, TreeManager } from './spark-data'

// ===== 枚举 / 常量 =====

export { RequestState } from './types'

// ===== CRUD 服务 =====

export { CrudService, createCrudService } from './crud-service'
export { createCrudLifecycleEvent } from './strategies/types'
export type { CrudResult, QueryParams, BatchResult, CrudOperationConfig } from './types'
export type { CrudOperation, CrudLifecycleEvent } from './strategies/types'

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
  EventSource,
  EventContext,
  DependencyType
} from './types'

export { generateEventId, generateViewEventId, generateComponentEventId, createEventContext } from './types'

// ===== 事件总线 =====
export { bus } from './event-bus'
export type { ViewCurrentRowPayload, ViewSelectedRowsPayload } from './event-bus'

// ===== 主键生成器 =====

export { 
  PrimaryKeyGenerator, 
  createPrimaryKeyGenerator, 
  createSnowflakeGenerator 
} from './core/primary-key-generator'
export type { 
  PrimaryKeyStrategy, 
  PrimaryKeyGeneratorConfig 
} from './core/primary-key-generator'

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

// ===== Vue Composables =====
// DataSet 生命周期管理（需要 Vue 3.5+）

export { usePageDataSet } from './composables/index'
export type { UsePageDataSetOptions, UsePageDataSetReturn } from './composables/index'
