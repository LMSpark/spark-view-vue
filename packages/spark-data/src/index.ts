/**
 * @spark-view/spark-data
 * SPARK 数据空间 — UI↔后端 桥接层
 *
 * 推荐使用 SparkData 命名空间 API
 */

// 命名空间
export { SparkData } from './spark-data-namespace'
export { default } from './spark-data-namespace'

// 类型
export type {
  IDataRow,
  IDataTable,
  ITableMetadata,
  IDataSet,
  IDataSetMetadata,
  ITreeManager,
  IDataView,
  IViewMetadata,
  EventCallback,
  FilterExpression,
  SortExpression,
  TreeConfig,
  FlatTreeNode,
  HttpEndpoint,
  CrudApi
} from './types'

// 权限常量
export { INSTANCE_PERMISSION_FIELD, MODEL_PERMISSION_FIELD } from '@spark-view/spark-utils'

// 能力管理器
export {
  DataSetCapabilityManager,
  createDataSetCapabilityManager,
  type DataSetCapabilityConfig
} from './capability/DataSetCapabilityManager'

// 工具函数
export { rowsEqual, isSameRow } from './core/utils'
