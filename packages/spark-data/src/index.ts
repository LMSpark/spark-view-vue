/**
 * @spark-view/spark-data
 * SPARK 数据空间包 - 提供类似 .NET DataSet 的数据管理能力
 *
 * ⚠️ 重要：这是所有数据类型和权限类型的唯一定义源
 * - 其他包只能导入使用，不能重新定义
 * - 保持数据类型系统的一致性和可维护性
 */

// =============================================================================
// 1. 命名空间 (Namespace)
// =============================================================================

/**
 * 推荐使用命名空间 API
 * @example
 * const dataSet = SparkData.createDataSet({...})
 * const treeManager = SparkData.createTreeManager({...})
 */
export { SparkData } from './spark-data-namespace'
export { default } from './spark-data-namespace'

// =============================================================================
// 2. 核心数据类型 (Core Data Types)
// =============================================================================

/**
 * 所有基础数据类型定义
 * - IDataRow: 数据行接口
 * - IDataTable: 数据表接口
 * - IDataSet: 数据集接口
 * - ITreeManager: 树形数据管理器接口
 * - IBindingContext: 数据绑定上下文接口
 */
export type {
  IDataRow,
  IDataTable,
  IDataSet,
  ITreeManager,
  IBindingContext,
  EventCallback,
  FilterExpression,
  SortExpression,
  TreeConfig,
  FlatTreeNode
} from './types'

// =============================================================================
// 3. 权限字段常量 (Permission Field Constants)
// =============================================================================

/**
 * 权限字段定义
 * - INSTANCE_PERMISSION_FIELD: 实例级权限字段
 * - MODEL_PERMISSION_FIELD: 模型级权限字段
 */
export { INSTANCE_PERMISSION_FIELD, MODEL_PERMISSION_FIELD } from '@spark-view/spark-utils'

// =============================================================================
// 4. 核心类 (Core Classes)
// =============================================================================

/**
 * 向后兼容的直接类导入
 * @deprecated 推荐使用 SparkData.createDataSet() 命名空间 API
 */
export { DataSetManager } from './dataSetManager'

// =============================================================================
// 5. 能力管理器 (Capability Managers)
// =============================================================================

/**
 * 数据集能力管理器
 * 提供基于 SPARK 能力系统的 DataSet 管理
 */
export {
  DataSetCapabilityManager,
  createDataSetCapabilityManager,
  type DataSetCapabilityConfig
} from './capability/DataSetCapabilityManager'

// =============================================================================
// 6. API 适配器 (API Adapter)
// =============================================================================

/**
 * API 适配器和配置类型
 * 提供 HTTP 端点配置到实际请求的转换
 */
export {
  ApiAdapter
} from './apiAdapter'
export type { IApiContext } from './apiAdapter'
