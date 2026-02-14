/**
 * SparkData 命名空间 API - 推荐使用方式
 */

import { DataSet } from './dataset'
import { TreeManager } from './tree-manager'
import { DataTable } from './data-table'
import { DataView } from './data-view'
import type { DataColumn, CrudApi, DataRelation, IDataSetMetadata, FlatTreeNode, IDataRow } from './types'

// SparkData 命名空间 API（推荐使用）
export namespace SparkData {
  // DataSet 相关
  export function createDataSet(config: {
    dataSetName: string
    tables: Record<string, {
      tableName: string
      columns: DataColumn[]
      rows?: IDataRow[]
      api?: CrudApi
    }>
    relations: DataRelation[] | undefined
    dataLoader: ((tableName: string) => Promise<IDataRow[]>) | undefined
  }): DataSet {
    return DataSet.fromConfig(config)
  }

  export function createDataSetFromMetadata(metadata: IDataSetMetadata): DataSet {
    return DataSet.fromMetadata(metadata)
  }

  // TreeManager 相关
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

  // fromJSON 方法
  export function fromJSON(json: string, dataLoader?: (tableName: string) => Promise<IDataRow[]>): DataSet {
    return DataSet.fromJSON(json, dataLoader)
  }

  // DataTable 相关
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

  // DataView 相关
  export function createDataView(config: {
    hostTable: string
    contextId?: string
  }): DataView {
    return new DataView(config.hostTable, config.contextId)
  }

  // createContext (兼容旧 API)
  export function createContext(hostTable: string, contextId?: string): DataView {
    return new DataView(hostTable, contextId)
  }
}

// 向后兼容的直接导出
export { DataSet } from './dataset'
export { TreeManager } from './tree-manager'
export { DataTable } from './data-table'
export { DataView } from './data-view'

// 核心引擎导出（内部使用）
export { RelationEngine } from './core/relation-engine'
export { EventManager } from './core/event-manager'
export { DependencyAnalyzer } from './core/dependency-analyzer'
export { SubscriptionManager } from './core/subscription-manager'
export { DataLoader } from './core/data-loader'

// 类型导出
export type {
  IDataSet,
  IDataTable,
  IDataView,
  ITableMetadata,
  IViewMetadata,
  DataColumn,
  CrudApi,
  FilterExpression,
  SortExpression,
  DataRelation,
  DependencyType,
  TreePath,
  FlatTreeNode,
  NestedTreeNode,
  ITreeManager
} from './types'