/**
 * DataSet — 数据空间协调器（容器 + 数据管理）
 *
 * 职责：表注册管理查询、关系注册管理查询、数据加载协调
 * 不操作下层：不主动调用 DataView/DataTable 的方法来改变它们的状态
 * 不消费下层：不订阅 DataView 的事件（DataSet 是顶层）
 */

import type { IDataSet, IDataSetMetadata, ITableMetadata, IViewMetadata, DataRelation, IDataRow, DataColumn, CrudApi } from './types'
import type { DataView as SparkDataView } from './data-view'
import { DataTable } from './data-table'

/** @internal 从未知值推断列类型 */
function inferColumnType(v: unknown): string {
  if (typeof v === 'number') return 'number'
  if (typeof v === 'boolean') return 'boolean'
  if (v === null) return 'string'
  if (typeof v === 'object') return 'object'
  return 'string'
}

export class DataSet implements IDataSet {

  // ===== 属性定义 =====

  /** 数据集名称 */
  dataSetName: string

  /** 数据表集合 */
  tables: Record<string, DataTable> = {}

  /** 数据关系定义 */
  relations: DataRelation[] | undefined

  /** 版本号 */
  version: number | undefined

  /** 页面ID */
  pageId: string | undefined



  // ===== 构造函数 =====

  /**
   * 创建数据集实例
   * @param config 数据集配置
   */
  constructor(config: {
    dataSetName: string
    tables: Record<string, ITableMetadata>
    relations?: DataRelation[] | undefined
    version?: number | undefined
    pageId?: string | undefined
  }) {
    this.dataSetName = config.dataSetName
    this.relations = config.relations
    this.version = config.version
    this.pageId = config.pageId

    // 构建表实例并建立引用链（DataSet → DataTable → DataView）
    this.tables = {}
    const tableDefs = config.tables ?? {}
    for (const [name, td] of Object.entries(tableDefs)) {
      const table = DataTable.fromTableData(td)
      table.setDataSet(this)  // 设置 table.dataSet = this, view.dataTable = table
      this.tables[name] = table
    }

    // 关系默认 viewId
    this.relations?.forEach(r => {
      r.parentViewId ??= 'default'
      r.childViewId ??= 'default'
    })
    
    // 🔧 自动设置单行表的 currentRow（方便数据绑定）
    for (const table of Object.values(this.tables)) {
      const view = table.getOrCreateView('default')
      if (view.rows.length === 1 && !view.currentRow) {
        const firstRow = view.rows[0]
        if (firstRow) {
          view.setCurrentRow(firstRow)
        }
      }
    }
  }

  // ===== 关系图查询（网状关系，非树形） =====

  /**
   * 查询以指定视图为父的子关系
   * @param parentTable 父表名
   * @param parentViewId 父视图ID
   */
  getChildRelations(parentTable: string, parentViewId: string): DataRelation[] {
    return (this.relations ?? []).filter(
      r => r.parentTable === parentTable && (r.parentViewId ?? 'default') === parentViewId
    )
  }

  /**
   * 查询以指定视图为子的父关系（在网状关系图中向上查找）
   * @param childTable 子表名
   * @param childViewId 子视图ID
   */
  getParentRelations(childTable: string, childViewId: string): DataRelation[] {
    return (this.relations ?? []).filter(
      r => r.childTable === childTable && (r.childViewId ?? 'default') === childViewId
    )
  }

  // ===== 工厂方法 =====

  /**
   * 从配置创建数据集实例
   * @param config 数据集配置
   * @returns 数据集实例
   */
  static fromConfig(config: {
    dataSetName: string
    tables: Record<string, {
      tableName: string
      columns: DataColumn[]
      rows?: IDataRow[]
      api?: CrudApi
      views?: Record<string, IViewMetadata>  // ✅ 支持 views 配置
    }>
    relations?: DataRelation[]
  }): DataSet {
    const tables: Record<string, ITableMetadata> = {}

    for (const [key, tableConfig] of Object.entries(config.tables)) {
      tables[key] = { ...tableConfig } as ITableMetadata
    }

    return new DataSet({
      dataSetName: config.dataSetName,
      tables,
      relations: config.relations,
    })
  }

  // ===== 数据访问 =====

  /**
   * 获取数据表
   * @param name 表名
   * @returns 数据表实例
   */
  getTable(name: string): DataTable | undefined {
    return this.tables[name]
  }

  /**
   * 获取数据视图（委托到 DataTable）
   */
  getView(tableName: string, viewId = 'default'): SparkDataView | undefined {
    const t = this.getTable(tableName)
    if (!t) return undefined
    return t.getOrCreateView(viewId)
  }

  // ===== 序列化 =====

  /**
   * 序列化为元数据对象
   * @returns 数据集元数据
   */
  toData(): IDataSetMetadata {
    const tables: Record<string, ITableMetadata> = {}
    for (const [n, t] of Object.entries(this.tables)) {
      tables[n] = t.toData()
    }
    return {
      dataSetName: this.dataSetName,
      tables,
      relations: this.relations,
      version: this.version,
      pageId: this.pageId
    } as IDataSetMetadata
  }

  /**
   * 序列化为可 JSON 化的对象（供 JSON.stringify 自动调用）
   * @returns 数据集配置对象
   */
  toJSON(): IDataSetMetadata {
    return this.toData()
  }

  // ===== 反序列化工厂方法 =====

  /**
   * 从元数据创建数据集实例
   * @param data 数据集元数据
   * @returns 数据集实例
   */
  static fromData(data: IDataSetMetadata): DataSet {
    return new DataSet(data)
  }

  /**
   * 从JSON字符串创建数据集实例
   * @param json JSON字符串
   * @returns 数据集实例
   */
  static fromJSON(json: string): DataSet {
    return DataSet.fromData(JSON.parse(json) as IDataSetMetadata)
  }

  /**
   * 从 pagedata.json 原始对象归一化并构建 DataSet 实例
   *
   * 支持两种格式：
   * 1. 标准 DataSet 配置（含 `dataset.tables` 字段）→ 直接使用该子结构
   * 2. 任意 key-value 结构 → 每个 key 归一化为一张表（数组/对象/基础类型）
   *
   * @param rawPageData pagedata.json 原始对象
   * @returns 归一化后的 DataSet 实例
   */
  static fromPageData(rawPageData: Record<string, unknown>): DataSet {
    // 情形 1：rawPageData.dataset.tables 存在 → 标准 DataSet 配置，直接透传
    const datasetCandidate = rawPageData['dataset']
    if (
      datasetCandidate &&
      typeof datasetCandidate === 'object' &&
      'tables' in (datasetCandidate as Record<string, unknown>)
    ) {
      const rd = datasetCandidate as {
        dataSetName?: string
        tables?: Record<string, { 
          tableName: string
          columns: DataColumn[]
          rows?: IDataRow[]
          api?: CrudApi
          views?: Record<string, IViewMetadata>  // ✅ 支持 views 配置
        }>
        relations?: DataRelation[]
      }
      return DataSet.fromConfig({
        dataSetName: rd.dataSetName ?? 'PageDataSet',
        tables: rd.tables ?? {},
        ...(rd.relations ? { relations: rd.relations } : {}),
      })
    }

    // 情形 2：将整个 pagedata 的每个 key 归一化为一张表
    const tables: Record<string, { tableName: string; columns: DataColumn[]; rows: IDataRow[] }> = {}

    for (const [key, val] of Object.entries(rawPageData)) {
      if (key === 'dataset') continue

      // 数组 → 表格行
      if (Array.isArray(val)) {
        const rows: IDataRow[] = []
        let columns: DataColumn[] = []

        if (val.length === 0) {
          columns = []
        } else if (typeof val[0] === 'object' && val[0] !== null && !Array.isArray(val[0])) {
          // 对象数组：以第一个元素的键推断列
          const sample = val[0] as Record<string, unknown>
          columns = Object.keys(sample).map(n => ({ name: n, type: inferColumnType(sample[n]), label: n })) as DataColumn[]
          for (const r of val) rows.push(r as IDataRow)
        } else {
          // 基础类型数组：单列 value
          columns = [{ name: 'value', type: inferColumnType(val[0]), label: 'value' }]
          for (const r of val) rows.push({ value: r } as IDataRow)
        }

        tables[key] = { tableName: key, columns, rows }
        continue
      }

      // 对象 → 单行表
      if (val && typeof val === 'object') {
        const obj = val as Record<string, unknown>
        const columns = Object.keys(obj).map(n => ({ name: n, type: inferColumnType(obj[n]), label: n })) as DataColumn[]
        const row = obj as IDataRow
        tables[key] = { tableName: key, columns, rows: [row] }
        continue
      }

      // 基础类型 → 单列单行表
      tables[key] = {
        tableName: key,
        columns: [{ name: 'value', type: inferColumnType(val), label: 'value' }],
        rows: [{ value: val } as IDataRow],
      }
    }

    // 构造函数会自动设置单行表的 currentRow
    return DataSet.fromConfig({ dataSetName: 'PageDataSet', tables })
  }
}

