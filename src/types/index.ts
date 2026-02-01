/**
 * Types 统一导出入口
 */

// ==================== DataSet 核心类型 ====================
// Re-export from dataset-core package
export type {
  DataRow,
  IBindingContext,
  DataColumn,
  HttpEndpoint,
  CrudApi,
  ITreeManager,
  IDataTable,
  DependencyType,
  SortDirection,
  SortExpression,
  FilterOperator,
  FilterExpression,
  DataRelation,
  IDataSet,
  FilterResult,
  FilterContext,
  TreeConfig,
  FlatTreeNode,
  NestedTreeNode,
  FlatTreeCache,
  SelfReferenceTable,
  TreePath,
  TreeSearchResult
} from '@spark-view/dataset-core'

// ==================== 页面配置类型 ====================
export type {
  FormCreateRule,
  PageRule,
  HttpMethod,
  ApiConfig,
  DataSource,
  PageConfig,
  RouteConfig,
  ApiResponse
} from './page'
