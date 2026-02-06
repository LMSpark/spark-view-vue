/**
 * DataSetManager 工厂类
 * 相当于 .NET 的 DataSet 工厂 - 提供静态方法创建和管理 DataSet 实例
 * 
 * 架构对应关系：
 * .NET DataSet    → DataSet (dataSet.ts)     - 领域逻辑层
 * .NET DataTable  → DataTable (DataTable.ts)  - 结构层
 * .NET DataView   → BindingContext (BindingContext.ts) - 视图层
 * .NET Factory    → DataSetManager (本文件)   - 工厂层
 */

import type { IDataSet, IDataRow } from './types'
import { DataSet } from './dataset'

/**
 * DataSetManager 工厂类（纯静态方法）
 */
export class DataSetManager {
  /**
   * 创建 DataSet 实例
   * @param config DataSet 配置
   * @param dataLoader 可选的数据加载器
   * @returns DataSet 实例
   */
  static create(
    config: IDataSet,
    dataLoader?: (tableName: string) => Promise<IDataRow[]>
  ): DataSet {
    return new DataSet(config, dataLoader)
  }

  /**
   * 从 JSON 字符串创建 DataSet 实例
   * @param json JSON 字符串
   * @param dataLoader 可选的数据加载器
   * @returns DataSet 实例
   */
  static fromJSON(
    json: string,
    dataLoader?: (tableName: string) => Promise<IDataRow[]>
  ): DataSet {
    return DataSet.fromJSON(json, dataLoader)
  }

  /**
   * 从配置文件创建 DataSet 实例（未实现）
   * @param _pageId 页面 ID
   * @param _dataLoader 可选的数据加载器
   * @returns DataSet 实例
   */
  static async fromConfig(
    _pageId: string,
    _dataLoader?: (tableName: string) => Promise<IDataRow[]>
  ): Promise<DataSet> {
    // 这里可以添加从配置文件加载的逻辑
    // 例如：从 src/pages-config/{pageId}/pagedata.json 加载
    throw new Error('Not implemented: fromConfig')
  }
}

