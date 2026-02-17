/**
 * SparkData 命名空间 API - 推荐使用方式
 */

import { DataSet } from './dataset'
import { TreeManager } from './tree-manager'
import { DataTable } from './data-table'
import { DataView } from './data-view'
import { CrudService } from './crud-service'
import { parseDataKey as _parseDataKey, resolveDataKey as _resolveDataKey, isDataKey as _isDataKey, buildDataKey as _buildDataKey, getViewKey as _getViewKey } from './core/data-key'
import type { DataKeyDescriptor, DataKeyField } from './core/data-key'
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
    viewId?: string
  }): DataView {
    return new DataView(config.tableName, config.viewId)
  }

  // ===== DataKey 统一解析 =====

  /** DataKey 描述符类型 */
  export type { DataKeyDescriptor, DataKeyField }

  /**
   * 判断 dataKey 是否为 DataSet 数据键
   * @example isDataKey('MyApp@Users@default@rows') // true
   */
  export const isDataKey = _isDataKey

  /**
   * 解析 dataKey 为结构化描述符
   * @example parseDataKey('MyApp@Users@default@rows')
   * // { scope: 'MyApp', tableName: 'Users', viewId: 'default', field: 'rows' }
   */
  export const parseDataKey = _parseDataKey

  /**
   * 从 DataSet 中解析数据键对应的值
   * @example resolveDataKey(descriptor, dataSet) // → view.rows
   */
  export const resolveDataKey = _resolveDataKey

  /**
   * 构建标准化 DataKey 字符串
   * @example buildDataKey('MyApp', 'Users', 'rows') // 'MyApp@Users@default@rows'
   */
  export const buildDataKey = _buildDataKey

  /**
   * 从描述符提取视图唯一键
   * @example getViewKey(descriptor) // 'Users.default'
   */
  export const getViewKey = _getViewKey
}

// ===== 类导出 =====

export { DataSet } from './dataset'
export { TreeManager } from './tree-manager'
export { DataTable } from './data-table'
export { DataView } from './data-view'