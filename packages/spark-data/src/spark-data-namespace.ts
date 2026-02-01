/**
 * SPARK Data Namespace
 * 提供统一的数据空间 API，简化消费层使用
 */

import { DataSet } from './dataset-impl.js'
import { DataTable } from './dataTable.js'
import { BindingContext } from './bindingContext.js'
import { TreeManager } from './treeManager.js'
import { DataSetManager } from './dataSetManager.js'
import { FilterExpressionParser } from './filterExpressionParser.js'
import type { IDataSet, DataRow, TreeConfig, FlatTreeNode } from './types.js'

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
  createDataSet: (
    config: IDataSet,
    dataLoader?: (tableName: string) => Promise<DataRow[]>
  ): DataSet => {
    return DataSetManager.create(config, dataLoader)
  },

  /**
   * 从 JSON 创建 DataSet
   * @example
   * const ds = SparkData.fromJSON(jsonString, dataLoader)
   */
  fromJSON: (
    json: string,
    dataLoader?: (tableName: string) => Promise<DataRow[]>
  ): DataSet => {
    return DataSetManager.fromJSON(json, dataLoader)
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
    bindingContext?: BindingContext
  ): TreeManager => {
    return new TreeManager(config, initialNodes, bindingContext)
  },

  /**
   * 从 JSON 恢复 TreeManager
   */
  treeFromJSON: (
    json: string,
    bindingContext?: BindingContext
  ): TreeManager => {
    return TreeManager.fromJSON(json, bindingContext)
  },

  // ==================== BindingContext 工厂方法 ====================
  
  /**
   * 创建 BindingContext 实例
   * @example
   * const ctx = SparkData.createContext('Users', 'default', dataSet)
   */
  createContext: (
    hostTable: string,
    contextId: string = 'default',
    dataSet?: IDataSet
  ): BindingContext => {
    return new BindingContext(hostTable, contextId, dataSet)
  },

  // ==================== 工具方法 ====================
  
  /**
   * 解析过滤表达式
   * @example
   * const parser = SparkData.createFilterParser()
   * const result = parser.evaluate(rows, expression)
   */
  createFilterParser: (): FilterExpressionParser => {
    return new FilterExpressionParser()
  },

  // ==================== 直接类访问（高级用户） ====================
  
  /**
   * 直接访问类构造器（高级用户）
   */
  classes: {
    DataSet,
    DataTable,
    BindingContext,
    TreeManager,
    DataSetManager,
    FilterExpressionParser
  }
} as const

// 默认导出命名空间
export default SparkData
