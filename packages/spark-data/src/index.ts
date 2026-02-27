/**
 * @spark-view/spark-data
 * SPARK 数据空间 — 数据模型 + 权限系统
 *
 * L1: 按职责分组，支持子路径按需导入。
 * 主入口保持全导出（向后兼容），高级消费者可使用：
 *   - @spark-view/spark-data/permission
 *   - @spark-view/spark-data/validation
 *   - @spark-view/spark-data/data-key
 *   - @spark-view/spark-data/utils
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
export type {
  IViewIdentity, IRowStore, ISelectionState,
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
  SortExpression,
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
  ViewStateEvent,
  DependencyType
} from './types'

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

export { isSameRow, getParentRows, buildPkSet, pruneInvalidSelections } from './core/utils'
export { resolveUrlTemplate } from './core/url-template'
export type { ResolvedUrl } from './core/url-template'

// ===== 委托类型导出（S1: 高级消费者通过 view.selection / view.mutation / view.crud 访问） =====

export { SelectionDelegate } from './strategies/selection-delegate'
export { LocalMutationDelegate } from './strategies/local-mutation-delegate'
export { CrudDelegate } from './strategies/crud-delegate'
