/**
 * @spark-view/spark-data
 * SPARK 数据空间 — 数据模型 + CRUD + 树结构 + 权限
 *
 * **推荐入口**：`SparkData` 命名空间（工厂方法 + 解析工具）
 *
 * 精简公共 API，只暴露外部消费者实际需要的最小集合：
 * - 命名空间：`SparkData`
 * - 核心类：`DataSet`（spark-page-config 直接使用）、`DataView`（框架层 wrapInstance 钩子）
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

// ===== DataKey 统一解析 =====

export {
  isDataKey,
  parseDataKey,
  resolveDataKey,
  resolveDataKeyBinding,
  resolveRawKey,
  getViewFromRawKey,
} from './core/data-key'
export type { DataKeyBinding } from './core/data-key'

// ===== 核心类型 =====

export type {
  // 基础数据行 / 数据源接口
  IDataRow,
  IDataSource,
  IDataSet,

  // DataSet 配置（createDataSet / fromConfig 参数类型）
  IDataSetMetadata,
  ITableMetadata,
  DataColumn,
  TableRelation,
  ViewDependency,
  CrudApi,
  CrudResult,
  HttpEndpoint,

  // 视图配置
  IViewMetadata,
  FilterExpression,
  FilterOperator,
  SortExpression,
  SortDirection,
  SortField,
  TreeConfig,
  TreePath,
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
  RequestState,
  INSTANCE_PERMISSION_FIELD,
  MODEL_PERMISSION_FIELD,
  FieldVisibility,
  ComponentLevel,
} from './types'

// ===== 列验证规则 =====

export { extractColumnRules, isColumnRequired } from './column-validation'
export type { ColumnValidationRule, ValidationRuleType } from './column-validation'
