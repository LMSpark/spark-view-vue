/**
 * SPARK Data Namespace
 * 提供统一的数据空间 API，简化消费层使用
 */

import { DataSet } from './dataset.js'
import { DataTable } from './dataTable.js'
import { DataView } from './bindingContext.js'
import { TreeManager } from './treeManager.js'
import { FilterExpressionParser } from './filterExpressionParser.js'
import { 
  DataSetCapabilityManager, 
  createDataSetCapabilityManager,
  type DataSetCapabilityConfig 
} from './capability/DataSetCapabilityManager.js'
import type { IDataSet, IDataSetConfig, IDataRow, TreeConfig, FlatTreeNode } from './types.js'

/**
 * SparkData 命名空间
 * 统一数据空间操作入口
 */
export const SparkData = {
  // ==================== DataSet 工厂方法 ====================
  
  /**
   * 创建 DataSet 实例
   * @example
   * const ds = SparkData.createDataSet({
   *   dataSetName: 'MyData',
   *   tables: { Users: { tableName: 'Users', columns: [], rows: [] } }
   * })
   */
  createDataSet: (config: IDataSetConfig): DataSet => {
    return new DataSet(config)
  },

  /**
   * 从 JSON 创建 DataSet
   * @example
   * const ds = SparkData.fromJSON(jsonString, dataLoader)
   */
  fromJSON: (
    json: string,
    dataLoader?: (tableName: string) => Promise<IDataRow[]>
  ): DataSet => {
    return DataSet.fromJSON(json, dataLoader)
  },

  // ==================== TreeManager 工厂方法 ====================
  
  /**
   * 创建 TreeManager 实例
   * @example
   * const tree = SparkData.createTreeManager({
   *   idField: 'id',
   *   parentIdField: 'parentId',
   *   lazy: true
   * })
   */
  createTreeManager: (
    config: TreeConfig,
    initialNodes?: FlatTreeNode[],
    dataView?: DataView
  ): TreeManager => {
    return new TreeManager(config, initialNodes, dataView)
  },

  /**
   * 从 JSON 恢复 TreeManager
   */
  treeFromJSON: (
    json: string,
    dataView?: DataView
  ): TreeManager => {
    return TreeManager.fromJSON(json, dataView)
  },

  // ==================== DataView 工厂方法 ====================

  /**
   * 创建 DataView 实例
   * @example
   * const ctx = SparkData.createContext('Users', 'default', dataSet)
   */
  createContext: (
    hostTable: string,
    contextId: string = 'default',
    dataSet?: IDataSet
  ): DataView => {
    return new DataView(hostTable, contextId, dataSet)
  },

  // ==================== 工具方法 ====================
  
  /**
   * 过滤表达式解析器（静态工具类）
   * @example
   * const filterFn = SparkData.FilterParser.toMemoryFilter(expression)
   * const sql = SparkData.FilterParser.toSQL(expression)
   */
  FilterParser: FilterExpressionParser,

  // ==================== 能力管理器 ====================
  
  /**
   * 创建 DataSet 能力管理器
   * @example
   * const capManager = SparkData.createCapabilityManager('page1', {
   *   dataSet: myDataSet,
   *   globalData: { getUserInfo: () => ({...}) }
   * })
   */
  createCapabilityManager: (
    pageId: string,
    config: DataSetCapabilityConfig
  ): DataSetCapabilityManager => {
    return createDataSetCapabilityManager(pageId, config)
  },

  // ==================== 直接类访问（高级用户） ====================
  
  /**
   * 直接访问类构造器（高级用户）
   */
  classes: {
    DataSet,
    DataTable,
    DataView,
    TreeManager,
    FilterExpressionParser
  }
} as const

// 默认导出命名空间
export default SparkData
