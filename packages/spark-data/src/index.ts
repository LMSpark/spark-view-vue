/**
 * @spark-view/spark-data
 * SPARK 数据空间 — 数据模型 + CRUD + 树结构 + 权限
 *
 * **推荐入口**：`SparkData` 命名空间（工厂方法 + 解析工具）
 *
 * 精简公共 API，只暴露外部消费者实际需要的最小集合：
 * - 命名空间：`SparkData`
 * - 核心类：`DataSet`、`DataView`（纯 TS，无框架依赖）
 * - DataKey 解析工具函数
 * - 权限渲染常量
 * - 数据配置所需的类型
 */

// ===== 命名空间 API（推荐入口）=====

export { SparkData } from './spark-data'

// ===== 核心类（框架层必要直接引用）=====

export { DataSet } from './dataset'
export { DataTable } from './data-table'
export { DataView } from './data-view'
export { DataSetCrudTool } from './dataset-crud-tool'
export {
  clearDataSetSnapshots,
  commitDataSetSnapshot,
  createLocalStorageHistoryAdapter,
  formatPageDataSnapshot,
  getDataSetSnapshot,
  listDataSetSnapshots,
  resolveDataSetHistoryKey,
} from './dataset-history'
export type {
  DataSetCommitSnapshotOptions,
  DataSetHistorySnapshot,
  DataSetHistoryListOptions,
  DataSetHistoryScope,
  DataSetSnapshotSelector,
  DataSetHistoryStorageAdapter,
} from './dataset-history'

// ===== DataKey 统一解析 =====

export {
  isViewKey,
  parseViewKey,
  diagnoseViewKey,
  resolveViewKey,
  buildViewKey,
  isDataKey,
  parseDataKey,
  diagnoseDataKey,
  resolveDataKey,
  resolveDataKeyBinding,
  resolveRawKey,
  getViewFromRawKey,
  buildDataKey,
  getViewKey,
} from './core/data-key'
export type {
  DataKeyBinding,
  DataKeyDiagnostic,
  DataKeyDiagnosticStatus,
  ViewKeyDescriptor,
  ViewKeyDiagnostic,
  ViewKeyDiagnosticStatus,
} from './core/data-key'
export {
  resolveDataCapabilitiesFromDataKey,
  resolveViewFromDataKey,
  deriveDataKeyFromViewKey,
  deriveSiblingFieldDataKey,
} from './core/data-key'
export type { DataKeyDescriptor, DataKeyField, ResolvedDataCapabilities } from './core/data-key'

// ===== 核心类型 =====

export type {
  // 基础数据行 / 数据源接口（分层 ISP）
  IDataRow,
  IRowDataSource,
  ICurrentRowSource,
  IDataSource,
  IDataViewStore,
  DataViewSnapshot,
  DataViewChangeEvent,
  DataViewChangeListener,
  DataViewStateChangeKind,
  IDataSet,

  // DataSet 配置（createDataSet / fromJson 参数类型）
  IDataSetMetadata,
  ITableMetadata,
  DataColumn,
  TableRelation,
  ViewDependency,
  TableResourceType,
  TableBusinessCategory,
  TableSemanticMetadata,
  CrudApi,
  CrudResult,
  HttpEndpoint,
  QueryParams,
  DependencySource,
  DependencyBinding,
  DependencyBindingOperator,
  FieldDependency,
  FieldDependencyLookup,
  FieldDependencyScope,
  FieldDependencyValuePolicy,
  FieldChangeNotification,
  ViewDependencyEmptyPolicy,
  ViewDependencySourceType,

  // 视图配置
  IViewMetadata,
  FilterFieldRef,
  FilterExpression,
  FilterOperator,
  FilterValueExpression,
  SortExpression,
  SortDirection,
  SortField,
  TreeConfig,
  TreePath,
  FlatTreeNode,
  NestedTreeNode,
  NestedTreeSearchResult,
  AggregateType,
  AggregateColumnConfig,

  // 提交模式
  CommitMode,

  // 事件订阅
  ViewChangeHandlers,

  // 权限快照（存储在 IDataRow._perm / IDataSource._modelPerm）
  IInstancePermission,
  IModelPermission,
} from './types'

// ===== 枚举 & 权限渲染常量 =====

export {
  TABLE_RESOURCE_TYPE_RECOMMENDED_VALUES,
  TABLE_BUSINESS_CATEGORY_RECOMMENDED_VALUES,
  RequestState,
  INSTANCE_PERMISSION_FIELD,
  MODEL_PERMISSION_FIELD,
  FieldVisibility,
  ComponentLevel,
} from './types'

// ===== 列验证规则 =====

export { extractColumnRules, isColumnRequired } from './column-validation'
export type { ColumnValidationRule, ValidationRuleType } from './column-validation'

// ===== 事件发射器（spark-data 是 SSoT；spark-component 等下游 re-export） =====

export { createEventEmitter } from './core/event-emitter'
export type { IEventEmitter } from './types'
