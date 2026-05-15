/**
 * SparkData 命名空间 API - 推荐使用方式
 */

import { DataSet } from './dataset'
import { TreeManager } from './tree-manager'
import { DataTable } from './data-table'
import { DataView } from './data-view'
import { DataSetCrudTool } from './dataset-crud-tool'
import { CrudService } from './crud-service'
import * as DataSetHistoryModule from './dataset-history'
import * as DataKeyModule from './core/data-key'
import * as ColumnValidationModule from './column-validation'
import type { CrudApi, TableRelation, ViewDependency, FlatTreeNode, TreeConfig, IDataSetMetadata, ITableMetadata, IViewMetadata } from './types'
import type { RequestConfig } from '@spark-view/spark-utils'

// ===== SparkData 命名空间 API =====

/** SparkData 命名空间 API（推荐使用） */
export namespace SparkData {
  // 规矩：公共 create* API 不暴露匿名对象类型；优先直接使用命名类型或位置参数。

  // ===== DataSet 工厂方法 =====

  /**
   * 创建数据集实例。
   * 该入口只接受 canonical `IDataSetMetadata`，用于强约束建模与 fail-fast 类型校验。
   * 原始 pagedata 对象或 JSON 字符串统一走 `fromJson()`。
   * @param meta DataSet 元数据对象
   * @returns 数据集实例
   */
  export function createDataSet(meta: IDataSetMetadata): DataSet {
    return DataSet.fromJson(meta)
  }

  /**
   * 从 JSON 字符串、canonical DataSet 对象或 pagedata 原始对象创建数据集实例。
   * 历史 `{ dataset: ... }` 包裹结构已移除。
   * 当输入不是 `IDataSetMetadata` 强约束对象时，应使用该入口完成归一化。
   * @param json JSON 字符串或对象
   * @returns 数据集实例
   */
  export function fromJson(json: IDataSetMetadata | Record<string, unknown> | string): DataSet {
    return DataSet.fromJson(json)
  }

  // ===== TreeManager 工厂方法 =====

  /**
   * 创建树管理器实例。
   * 该入口直接接受 `TreeConfig`，避免公共 API 再定义匿名对象签名。
   * @param config 树结构字段配置
   * @param initialNodes 初始节点
   * @returns 树管理器实例
   */
  export function createTreeManager(config: TreeConfig, initialNodes?: FlatTreeNode[]): TreeManager {
    return new TreeManager({ ...config }, undefined, initialNodes)
  }

  // ===== DataTable 工厂方法 =====

  /**
   * 创建数据表实例。
   * 该入口只接受 canonical `ITableMetadata`。
   * @param meta 数据表元数据
   * @returns 数据表实例
   */
  export function createDataTable(meta: ITableMetadata): DataTable {
    return DataTable.fromJson(meta)
  }

  // ===== CRUD 服务工厂方法 =====

  /**
   * 创建CRUD服务实例
   * @param api CRUD API配置
   * @param httpConfig HTTP配置
   * @returns CRUD服务实例
   */
  export function createCrudService(api: CrudApi, httpConfig?: RequestConfig) {
    return new CrudService(api, httpConfig)
  }

  /**
   * 创建元数据驱动数据库表的标准 CRUD/Tree API。
   *
   * URL 使用平台相对路径，运行时会由 CrudService/TreeManager 按当前
   * tenantId/projectId 自动补齐为 `/api/tenants/{tenantId}/projects/{projectId}/...`。
   */
  export function createDatabaseCrudApi(tableName: string): CrudApi {
    const encodedTableName = encodeURIComponent(tableName)
    const base = `/data/${encodedTableName}`
    return {
      list: { url: `${base}/query`, method: 'POST' },
      create: { url: `${base}/records`, method: 'POST' },
      retrieve: { url: `${base}/records/get`, method: 'POST' },
      update: { url: `${base}/records/update`, method: 'POST' },
      delete: { url: `${base}/records/delete`, method: 'POST' },
      batch: {
        create: { url: `${base}/records/batch-create`, method: 'POST' },
        update: { url: `${base}/records/batch-update`, method: 'POST' },
        delete: { url: `${base}/records/batch-delete`, method: 'POST' },
      },
      children: { url: `${base}/tree/children`, method: 'POST' },
      path: { url: `${base}/tree/path`, method: 'POST' },
      subtree: { url: `${base}/tree/subtree`, method: 'POST' },
      move: { url: `${base}/tree/move`, method: 'POST' },
      search: { url: `${base}/tree/search`, method: 'POST' },
      nested: { url: `${base}/tree/nested`, method: 'POST' },
      nestedSearch: { url: `${base}/tree/nested/search`, method: 'POST' },
    }
  }

  // ===== DataView 工厂方法 =====

  /**
   * 创建数据视图实例。
   * 使用位置参数 `tableName` 提供强约束，其他视图配置统一复用 `IViewMetadata`。
   * @param tableName 表名
   * @param meta 数据视图元数据
   * @returns 数据视图实例
   */
  export function createDataView(tableName: string, meta?: IViewMetadata): DataView {
    const view = new DataView(tableName, meta?.viewId)
    // 所有视图配置字段由 applyViewConfig 集中赋值，单一来源
    view.applyViewConfig({ ...meta, tableName })
    return view
  }

  /**
   * 创建 DataSet CRUD 工具类实例。
   * 该工具类以 DataSet 为中心，统一提供表、视图、行、关系、依赖的 CRUD facade。
   */
  export function createDataSetCrudTool(dataSetName: string): DataSetCrudTool {
    return new DataSetCrudTool(dataSetName)
  }

  export const listDataSetSnapshots = DataSetHistoryModule.listDataSetSnapshots
  export const getDataSetSnapshot = DataSetHistoryModule.getDataSetSnapshot
  export const commitDataSetSnapshot = DataSetHistoryModule.commitDataSetSnapshot
  export const createLocalStorageHistoryAdapter = DataSetHistoryModule.createLocalStorageHistoryAdapter
  export const formatPageDataSnapshot = DataSetHistoryModule.formatPageDataSnapshot

  // ===== 关系快捷创建 =====

  /**
   * 创建表关系定义（L1 数据 schema）。
   * 直接接受 `TableRelation`，避免公共 API 暴露匿名 options 类型。
   *
   * @example
   * ```ts
   * SparkData.createTableRelation({ parentTable: 'Users', childTable: 'Orders', childField: 'userId' })
   * // → { parentTable: 'Users', childTable: 'Orders', childField: 'userId' }
   * ```
   */
  export function createTableRelation(relation: TableRelation): TableRelation {
    return {
      ...relation,
    }
  }

  /**
   * 创建视图依赖定义（L2 视图联动 schema）。
   * 直接接受 `ViewDependency`，避免公共 API 暴露匿名 options 类型。
   *
   * @example
   * ```ts
   * SparkData.createViewDependency({
  *   parentTable: 'Users',
  *   childTable: 'Orders',
  *   dependencyType: 'selectedRows'
   * })
   * ```
   */
  export function createViewDependency(dependency: ViewDependency): ViewDependency {
    return {
      ...dependency,
    }
  }

  // ===== DataKey 统一解析 =====

  /** 判断 viewKey 是否为 DataView 定位键 */
  export const isViewKey = DataKeyModule.isViewKey

  /** 解析 viewKey 为结构化描述符 */
  export const parseViewKey = DataKeyModule.parseViewKey

  /** 诊断 ViewKey 绑定链路 */
  export const diagnoseViewKey = DataKeyModule.diagnoseViewKey

  /** 从 DataSet 中解析 ViewKey 对应的 DataView */
  export const resolveViewKey = DataKeyModule.resolveViewKey

  /** 判断 dataKey 是否为 DataSet 数据键 */
  export const isDataKey = DataKeyModule.isDataKey

  /** 解析 dataKey 为结构化描述符 */
  export const parseDataKey = DataKeyModule.parseDataKey

  /** 诊断 DataKey 绑定链路 */
  export const diagnoseDataKey = DataKeyModule.diagnoseDataKey

  /** 从 DataSet 中解析数据键对应的值 */
  export const resolveDataKey = DataKeyModule.resolveDataKey

  /** 解析 DataKey 为渲染绑定描述符（判别联合，避免 instanceof DataView） */
  export const resolveDataKeyBinding = DataKeyModule.resolveDataKeyBinding

  /** 构建标准化 ViewKey 字符串 */
  export const buildViewKey = DataKeyModule.buildViewKey

  /** 构建标准化 DataKey 字符串 */
  export const buildDataKey = DataKeyModule.buildDataKey

  /** 从 ViewKey 派生同视图 DataKey */
  export const deriveDataKeyFromViewKey = DataKeyModule.deriveDataKeyFromViewKey

  /** 从描述符提取视图唯一键 */
  export const getViewKey = DataKeyModule.getViewKey

  // ===== 列验证规则提取 =====

  /** 从 DataColumn 提取框架无关的验证规则描述符 */
  export const extractColumnRules = ColumnValidationModule.extractColumnRules

  /** 判断列是否为必填 */
  export const isColumnRequired = ColumnValidationModule.isColumnRequired

}
