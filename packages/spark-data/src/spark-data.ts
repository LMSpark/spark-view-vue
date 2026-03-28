/**
 * SparkData 命名空间 API - 推荐使用方式
 */

import { DataSet } from './dataset'
import { TreeManager } from './tree-manager'
import { DataTable } from './data-table'
import { DataView } from './data-view'
import { CrudService } from './crud-service'
import * as DataKeyModule from './core/data-key'
import * as ColumnValidationModule from './column-validation'
import type { DataColumn, CrudApi, DataRelation, DependencyType, FlatTreeNode, AggregateColumnConfig, TreeConfig, FilterExpression, SortExpression, CommitMode } from './types'
import type { RequestConfig } from '@spark-view/spark-utils'

// ===== SparkData 命名空间 API =====

/** SparkData 命名空间 API（推荐使用） */
export namespace SparkData {
  // ===== DataSet 工厂方法 =====

  /**
   * 创建数据集实例
   * @param config 数据集配置
   * @returns 数据集实例
   */
  export function createDataSet(config: Parameters<typeof DataSet.fromConfig>[0]): DataSet {
    return DataSet.fromConfig(config)
  }

  /**
   * 从json字符串创建数据集实例
   * @param json JSON字符串
   * @returns 数据集实例
   */
  export function fromJSON(json: string): DataSet {
    return DataSet.fromJSON(json)
  }

  /**
   * 从 pagedata.json 原始对象归一化并构建 DataSet 实例
   *
   * 支持两种格式：
   * 1. 标准 DataSet 配置（含 `dataset.tables` 字段）→ 直接使用
   * 2. 任意 key-value 结构 → 每个 key 归一化为一张表
   *
   * @param rawPageData pagedata.json 原始对象
   * @returns 归一化后的 DataSet 实例
   */
  export function fromPageData(rawPageData: Record<string, unknown>): DataSet {
    return DataSet.fromPageData(rawPageData)
  }

  // ===== TreeManager 工厂方法 =====

  /**
   * 创建树管理器实例
   * @param config 树结构字段配置
   * @param initialNodes 初始节点
   * @returns 树管理器实例
   */
  export function createTreeManager(config: {
    idField?: string
    parentIdField?: string
    textField?: string
    depthLimit?: number
    lazy?: boolean
    /** 树视图模式（默认 'flat'）：flat 返回平铺节点列表，nested 返回嵌套树结构 */
    treeMode?: 'flat' | 'nested'
  }, initialNodes?: FlatTreeNode[]): TreeManager {
    return new TreeManager({ ...config }, undefined, initialNodes)
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
    api?: CrudApi | string | boolean
  }): DataTable {
    const table = new DataTable(config.tableName, config.columns)
    if (config.api !== undefined && config.api !== false) {
      table.setApi(config.api)
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
  export function createCrudService(api: CrudApi, httpConfig?: RequestConfig) {
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
    /** 请求成功后自动将 currentRow 设为第一行，见 {@link DataView.autoCurrentFirst} */
    autoCurrentFirst?: boolean
    /** 请求成功后自动将 selectedRows 设为第一行，见 {@link DataView.autoSelectFirst} */
    autoSelectFirst?: boolean
    /** 树结构字段配置（idField/parentIdField/textField/depthLimit/lazy/treeMode） */
    treeConfig?: TreeConfig
    /** 初始化后自动加载（默认 false），见 {@link DataView.autoLoad} */
    autoLoad?: boolean
    /** 设置分页/排序/过滤后自动刷新（默认 false），见 {@link DataView.autoRefresh} */
    autoRefresh?: boolean
    /** 值字段名（默认主键字段），见 {@link DataView.valueField} */
    valueField?: string | string[]
    /** 标签显示字段名，见 {@link DataView.labelField} */
    labelField?: string
    /** 值序列化分隔符，见 {@link DataView.selectionDelimiter} */
    selectionDelimiter?: string
    /** 增删改提交模式，见 {@link DataView.commitMode} */
    commitMode?: CommitMode
    /** @deprecated 使用 commitMode 代替，见 {@link DataView.commitMode} */
    autoCommit?: boolean
    /** 视图级聚合配置，见 {@link DataView.aggregates} */
    aggregates?: Record<string, AggregateColumnConfig>
    /** 过滤表达式初始值 */
    filterExpression?: FilterExpression
    /** 排序表达式初始値 */
    sortExpression?: SortExpression
    /** 初始页码 */
    page?: number
    /** 每页条数 */
    pageSize?: number
  }): DataView {
    const view = DataView.create(config.tableName, config.viewId)
    // 所有视图配置字段由 applyViewConfig 集中赋值，单一来源
    view.applyViewConfig(config)
    return view
  }

  // ===== 关系快捷创建 =====

  /**
   * 创建简写关系定义（规范化由 DataSet 构造函数自动完成）
   *
   * @example
   * ```ts
   * SparkData.createRelation('Users', 'Orders', 'userId')
   * // → { parentTable: 'Users', childTable: 'Orders', childField: 'userId' }
   * ```
   */
  export function createRelation(
    parentTable: string,
    childTable: string,
    childField: string,
    options?: { parentField?: string; dependencyType?: DependencyType; autoLoad?: boolean },
  ): DataRelation {
    return {
      parentTable,
      childTable,
      childField,
      ...(options?.parentField !== undefined ? { parentField: options.parentField } : {}),
      ...(options?.dependencyType !== undefined ? { dependencyType: options.dependencyType } : {}),
      ...(options?.autoLoad !== undefined ? { autoLoad: options.autoLoad } : {}),
    }
  }

  // ===== DataKey 统一解析 =====

  /** 判断 dataKey 是否为 DataSet 数据键 */
  export const isDataKey = DataKeyModule.isDataKey

  /** 解析 dataKey 为结构化描述符 */
  export const parseDataKey = DataKeyModule.parseDataKey

  /** 从 DataSet 中解析数据键对应的值 */
  export const resolveDataKey = DataKeyModule.resolveDataKey

  /** 解析 DataKey 为渲染绑定描述符（判别联合，避免 instanceof DataView） */
  export const resolveDataKeyBinding = DataKeyModule.resolveDataKeyBinding

  /** 构建标准化 DataKey 字符串 */
  export const buildDataKey = DataKeyModule.buildDataKey

  /** 从描述符提取视图唯一键 */
  export const getViewKey = DataKeyModule.getViewKey

  // ===== 列验证规则提取 =====

  /** 从 DataColumn 提取框架无关的验证规则描述符 */
  export const extractColumnRules = ColumnValidationModule.extractColumnRules

  /** 判断列是否为必填 */
  export const isColumnRequired = ColumnValidationModule.isColumnRequired

}