/**
 * SparkData 命名空间 API - 推荐使用方式
 */

import { DataSet } from './dataset'
import { TreeManager } from './tree-manager'
import { DataTable } from './data-table'
import { DataView } from './data-view'
import { CrudService } from './crud-service'
import type { DataColumn, CrudApi, DataRelation, FlatTreeNode, IDataRow } from './types'

// ===== SparkData 命名空间 API =====

/** SparkData 命名空间 API（推荐使用） */
export namespace SparkData {
  // ===== DataSet 工厂方法 =====

  /**
   * 创建数据集实例
   * @param config 数据集配置
   * @returns 数据集实例
   */
  export function createDataSet(config: {
    dataSetName: string
    tables: Record<string, {
      tableName: string
      columns: DataColumn[]
      rows?: IDataRow[]
      api?: CrudApi
    }>
    relations?: DataRelation[]
    dataLoader?: (tableName: string) => Promise<IDataRow[]>
  }): DataSet {
    return DataSet.fromConfig(config)
  }

  /**
   * 从JSON字符串创建数据集实例
   * @param json JSON字符串
   * @param dataLoader 数据加载器
   * @returns 数据集实例
   */
  export function fromJSON(json: string, dataLoader?: (tableName: string) => Promise<IDataRow[]>): DataSet {
    return DataSet.fromJSON(json, dataLoader)
  }

  // ===== TreeManager 工厂方法 =====

  /**
   * 创建树管理器实例
   * @param config 树配置
   * @param initialNodes 初始节点
   * @returns 树管理器实例
   */
  export function createTreeManager(config: {
    idField?: string
    parentIdField?: string
    childrenField?: string
    rootId?: string | number | null
  }, initialNodes?: FlatTreeNode[]): TreeManager {
    return new TreeManager({
      mode: 'flat',
      ...config
    }, initialNodes)
  }

  // ===== DataTable 工厂方法 =====

  /**
   * 创建数据表实例
   * @param config 数据表配置
   * @returns 数据表实例
   */
  export function createDataTable(config: {
    tableName: string
    columns: DataColumn[]
    api?: CrudApi
  }): DataTable {
    const table = new DataTable(config.tableName, config.columns)
    if (config.api) {
      table.api = config.api
    }
    return table
  }

  // ===== CRUD 服务工厂方法 =====

  /**
   * 创建CRUD服务实例
   * @param api CRUD API配置
   * @param httpConfig HTTP配置
   * @returns CRUD服务实例
   */
  export function createCrudService(api: CrudApi, httpConfig?: import('./types').RequestConfig) {
    return new CrudService(api, httpConfig)
  }

  // ===== DataView 工厂方法 =====

  /**
   * 创建数据视图实例
   * @param config 数据视图配置
   * @returns 数据视图实例
   */
  export function createDataView(config: {
    tableName: string
    contextId?: string
  }): DataView {
    return new DataView(config.tableName, config.contextId)
  }
}

// ===== 类导出 =====

export { DataSet } from './dataset'
export { TreeManager } from './tree-manager'
export { DataTable } from './data-table'
export { DataView } from './data-view'