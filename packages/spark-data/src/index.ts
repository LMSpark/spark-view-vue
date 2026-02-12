/**
 * @spark-view/spark-data
 * SPARK 数据空间包 - 提供类似 .NET DataSet 的数据管理能力
 *
 * ⚠️ 架构原则
 * - 数据空间高级类型（DataTable, DataSet, DataView 等）的唯一定义源
 * - 基础类型（IDataRow, HttpRequestConfig 等）从 @spark-view/spark-utils 导入使用
 * - 其他包只能导入使用，不能重新定义，保持单一数据源原则 (Single Source of Truth)
 * 
 * 📦 推荐使用方式
 * ```typescript
 * import { SparkData } from '@spark-view/spark-data'
 * 
 * // 创建 DataSet
 * const dataSet = SparkData.createDataSet({
 *   dataSetName: 'MyData',
 *   tables: { Users: { tableName: 'Users', columns: [], rows: [] } }
 * })
 * 
 * // 创建 TreeManager
 * const tree = SparkData.createTreeManager({ idField: 'id', parentIdField: 'parentId' })
 * ```
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
 * - IDataRow: 数据行接口（从 spark-utils 重新导出）
 * - IDataTable: 数据表接口（运行时，包含方法）
 * - ITableMetadata: 数据表元数据接口（序列化，纯数据）
 * - IDataSet: 数据集接口（运行时，包含方法）
 * - IDataSetMetadata: 数据集元数据接口（序列化，纯数据）
 * - IDataView: 数据视图接口（运行时，继承 IViewMetadata，相当于 .NET DataView）
 * - IViewMetadata: 视图元数据接口（序列化，纯配置数据）
 * - ITreeManager: 树形数据管理器接口
 */
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
// 4. 能力管理器 (Capability Managers)
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
// 5. API 适配器 (API Adapter)
// =============================================================================

/**
 * HTTP 请求工具
 * 直接使用 @spark-view/spark-utils 的 Request 类
 */
export type { Request } from '@spark-view/spark-utils'
