/**
 * @spark-view/spark-data
 * SPARK 数据空间 — 数据模型 + CRUD + 树结构 + 权限
 *
 * **推荐入口**：`SparkData` 命名空间（工厂方法 + 解析工具）
 *
 * 精简公共 API，只暴露外部消费者实际需要的最小集合：
 * - 命名空间：`SparkData`
 * - 核心类：`DataSet`、`DataView`（纯 TS，无框架依赖）
 * - DataViewKey / DataMember 解析工具函数
 * - 权限渲染常量
 * - 数据配置所需的类型
 */

// ===== 命名空间 API（推荐入口）=====

export { SparkData } from './spark-data'

// ===== 核心类（框架层必要直接引用）=====

export { DataSet } from './dataset'
export { DataTable } from './data-table'
export { DataView } from './data-view'
export { isDataRow } from './core/data-row-guards'

export type { FieldRenderState, PermissionActionContext } from './script-types'

export { TreeManager } from './tree-manager'
export { DataSetCrudTool } from './dataset-crud-tool'

// ===== Navigation 类型（纯数据模型，从 spark-page-config 委托迁入）=====

export {
  isNavNode,
} from './navigation'

export type {
  AppModuleBase,
  AppNavRoot,
  AppNavigation,
  ChildPlacement,
  LinkTarget,
  NavContextConfig,
  NavContextItem,
  NavContextState,
  NavNode,
  NavNodeKind,
  NavPermissionMode,
  RegionItems,
  RegionVisibility,
} from './navigation'

// ===== Node Tree（页面节点树模型，从 spark-page-config 迁入）=====

export {
  SPARK_NODE_STRUCT_KEYS,
  SPARK_PAGE_NODE_TYPE,
  SPARK_PAGE_ROOT_ID,
  SparkNodeTree,
  isSparkNode,
  normalizeSparkNode,
  getSparkNodeChildren,
  nodeId,
  nodeInputProp,
  nodeInputProps,
} from './node-tree'

export type {
  SparkNode,
  SparkNodeChildren,
  SparkNodeFindByTypeMatch,
  SparkNodeFindByTypeParams,
  SparkNodeFindByTypeResult,
  SparkNodeLocation,
  SparkNodeTreeChildrenParams,
  SparkNodeTreeLookupParams,
  SparkNodeAddResult,
  SparkNodeMoveResult,
  SparkNodeRemoveResult,
  SparkNodeReplaceResult,
  SparkNodeSetPropsResult,
  SparkNodeAddNodesResult,
  SparkNodeRemoveNodesResult,
  SparkNodeReplaceNodesResult,
  SparkNodeSetPropsBatchResult,
  SparkNodeTreeAddNodesParams,
  SparkNodeTreeAddParams,
  SparkNodeTreeMoveParams,
  SparkNodeTreeRemoveNodesParams,
  SparkNodeTreeRemoveParams,
  SparkNodeTreeReplaceNodesParams,
  SparkNodeTreeReplaceParams,
  SparkNodeTreeSetPropsParams,
  SparkNodeTreeReplaceNodesItem,
  SparkNodeTreeSetPropsBatchItem,
  SparkNodeTreeSetPropsBatchParams,
  SparkNodeTreeFromJsonOptions,
  SparkNodeTreeJsonInput,
  SparkNodeTreeMethodKey,
  SparkNodeTreeRootParams,
  SparkNodeTreeRuleJsonInput,
} from './node-tree'
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

// ===== DataViewKey / DataMember 统一解析 =====

export {
  DataMember,
  isDataViewKey,
  parseDataViewKey,
  diagnoseDataViewKey,
  resolveDataViewKey,
  buildDataViewKey,
  resolveDataViewMember,
  diagnoseDataViewMember,
  resolveDataViewMemberBinding,
  getDataViewIdentity,
  resolveDataViewCapabilities,
} from './core/data-view-key'
export type {
  DataViewKeyDescriptor,
  DataViewKeyDiagnostic,
  DataViewKeyDiagnosticStatus,
  DataViewMemberBinding,
  DataViewMemberDescriptor,
  DataViewMemberDiagnostic,
  DataViewMemberDiagnosticStatus,
  DataViewMemberInput,
  DataViewMemberValue,
  ResolvedDataViewCapabilities,
} from './core/data-view-key'

// ===== 核心类型 =====

export type {
  // 基础数据行 / 数据源契约
  DataRow,
  DataSource,
  DataViewEditingFieldChangeEvent,
  DataViewApplyEditingRowsResult,
  DataSetSaveChangesOptions,
  DataSetSaveChangesResult,
  DataSetSaveChangesViewResult,
  DataSetSaveChangesViewSelector,
  DataSetSaveChangesMode,
  DataSetSaveChangesConfig,
  DataSetSaveChangesTransactionConfig,
  DataSetSaveChangesTransactionOptions,
  DataSetTransactionOperation,
  DataSetTransactionRequest,
  DataSetTransactionResponse,
  DataSetTransactionOperationResult,
  DataSetContract,

  // DataSet 配置（createDataSet / fromJson 参数类型）
  DataSetMetadata,
  TableMetadata,
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

  // 视图配置
  ViewMetadata,
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

  // 权限快照（存储在 DataRow._perm / DataSource._modelPerm）
  InstancePermission,
  ModelPermission,
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
export type { SparkEventEmitter } from './types'
