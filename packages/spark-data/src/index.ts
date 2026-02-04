/**
 * @spark-view/spark-data
 * SPARK 数据空间包 - 提供类似 .NET DataSet 的数据管理能力
 * 
 * ⚠️ 重要：这是所有数据类型和权限类型的唯一定义源
 * - 其他包只能导入使用，不能重新定义
 * - 保持数据类型系统的一致性和可维护性
 */

// 导出命名空间（推荐使用）
export { SparkData, SparkData as default } from './spark-data-namespace'

// 导出所有基础数据类型
export type * from './types'

// 导出权限类型（基础层，可被其他包共享）
export type {
  IInstancePermission,      // 实例级权限
  IModelPermission,         // 模型级权限
  WithInstancePermission,   // 权限工具类型
  WithModelPermission       // 权限工具类型
} from './permission-types'

export { INSTANCE_PERMISSION_FIELD, MODEL_PERMISSION_FIELD } from './permission-types'

// 导出核心类（向后兼容）
export { DataSet } from './dataset-impl'
export { DataTable } from './dataTable'
export { BindingContext } from './bindingContext'
export { TreeManager } from './treeManager'
export { DataSetManager } from './dataSetManager'
export { FilterExpressionParser } from './filterExpressionParser'

// 导出 API 适配器和 HTTP 客户端
export { ApiAdapter } from './apiAdapter'
export { createHttpClient, HttpClient } from './http/HttpClient'

// 导出能力管理器
export { 
  DataSetCapabilityManager, 
  createDataSetCapabilityManager,
  type DataSetCapabilityConfig 
} from './capability/DataSetCapabilityManager'
