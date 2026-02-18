/**
 * DataSet — 数据空间协调器（容器 + 能力提供）
 *
 * SPARK 能力系统模式（与组件系统同构）：
 *   - 实现 ICapabilityContext → 提供 DATA_SET 能力
 *   - 下层通过 lookup(ctx, DATA_SET) 消费
 *
 * 职责：表注册管理查询、关系注册管理查询、数据加载协调
 * 不操作下层：不主动调用 DataView/DataTable 的方法来改变它们的状态
 * 不消费下层：不订阅 DataView 的事件（DataSet 是顶层）
 */

import type { IDataSetMetadata, ITableMetadata, DataRelation, IDataRow, DataColumn, CrudApi } from './types'
import type { DataView as SparkDataView } from './data-view'
import { DataTable } from './data-table'
import { DATA_SET, provide as setCapability } from '@spark-view/spark-utils'
import type { CapabilityName, ICapabilityContext } from '@spark-view/spark-utils'

// ===== 能力接口（与类共同定义，避免循环引用） =====

/** DataSet 向 UI/组件暴露的能力 */
export interface IDataSetCapability {
  /** DataSet 实例引用 */
  readonly dataSet: DataSet
}

export class DataSet implements ICapabilityContext {
  // ===== ICapabilityContext =====

  /** 唯一标识 */
  id: string

  /** 上下文类型 */
  readonly type = 'dataset'

  /** 父级上下文（无，DataSet 是根） */
  parent?: ICapabilityContext

  /** 能力 Map */
  capabilities = new Map<CapabilityName, unknown>()

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
    this.id = `ds:${config.dataSetName}`
    this.relations = config.relations
    this.version = config.version
    this.pageId = config.pageId

    // 注册 DATA_SET 能力
    setCapability(this, DATA_SET, { dataSet: this } satisfies IDataSetCapability)

    // 构建表实例并建立 parent 链（DataSet → DataTable → DataView）
    this.tables = {}
    for (const [name, td] of Object.entries(config.tables)) {
      const table = DataTable.fromTableData(td)
      table.setDataSet(this)  // 设置 table.parent = this, view.parent = table
      this.tables[name] = table
    }

    // 关系默认 viewId
    this.relations?.forEach(r => {
      r.parentViewId ??= 'default'
      r.childViewId ??= 'default'
    })
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
   * 序列化为JSON字符串
   * @returns JSON字符串
   */
  toJSON(): string {
    return JSON.stringify(this.toData(), null, 2)
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
}
