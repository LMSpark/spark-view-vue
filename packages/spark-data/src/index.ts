/**
 * @spark-view/spark-data
 * SPARK 数据空间包 - 提供类似 .NET DataSet 的数据管理能力
 * 
 * ⚠️ 重要：这是所有数据类型和权限类型的唯一定义源
 * - 其他包只能导入使用，不能重新定义
 * - 保持数据类型系统的一致性和可维护性
 */

// 导出命名空间（推荐使用）
export { SparkData } from './spark-data-namespace'
export { default } from './spark-data-namespace'

// 导出所有基础数据类型（显式导出以确保类型可用）
export type {
  IDataRow,
  IDataTable,
  IDataSet,
  ITreeManager,
  IBindingContext,
  FilterExpression,
  SortExpression,
  TreeConfig,
  FlatTreeNode
} from './types'

export { INSTANCE_PERMISSION_FIELD, MODEL_PERMISSION_FIELD } from '@spark-view/spark-utils'

// 导出核心类（向后兼容）
export { DataSet } from './dataset'
export { DataTable } from './dataTable'
export { BindingContext } from './bindingContext'
export { TreeManager } from './treeManager'
export { DataSetManager } from './dataSetManager'
export { FilterExpressionParser } from './filterExpressionParser'

// 导出 API 适配器
export { ApiAdapter } from './apiAdapter'

// 导出能力管理器
export { 
  DataSetCapabilityManager, 
  createDataSetCapabilityManager,
  type DataSetCapabilityConfig,
  type AppServices
} from './capability/DataSetCapabilityManager'
