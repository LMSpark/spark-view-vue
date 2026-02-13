/**
 * SPARK Data Namespace
 * 提供统一的数据空间 API，简化消费层使用
 */

import { DataSet } from './dataset.js'
import { DataView } from './data-view.js'
import { TreeManager } from './tree-manager.js'
import { 
  DataSetCapabilityManager, 
  createDataSetCapabilityManager,
  type DataSetCapabilityConfig 
} from './capability/DataSetCapabilityManager.js'
import type { IDataSetConfig, IDataRow, TreeConfig, FlatTreeNode } from './types.js'

/**
 * SparkData 命名空间
 * 统一数据空间操作入口
 */
export const SparkData = {
  // ==================== DataSet 工厂方法 ====================
  
  /**
   * 创建 DataSet 实例
   */
  createDataSet: (config: IDataSetConfig): DataSet => {
    return new DataSet(config)
  },

  /**
   * 从 JSON 创建 DataSet
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
   */
  createContext: (
    hostTable: string,
    contextId: string = 'default',
    dataSet?: DataSet
  ): DataView => {
    return new DataView(hostTable, contextId, dataSet)
  },

  // ==================== 能力管理器 ====================
  
  /**
   * 创建 DataSet 能力管理器
   */
  createCapabilityManager: (
    pageId: string,
    config: DataSetCapabilityConfig
  ): DataSetCapabilityManager => {
    return createDataSetCapabilityManager(pageId, config)
  }
} as const

// 默认导出命名空间
export default SparkData
