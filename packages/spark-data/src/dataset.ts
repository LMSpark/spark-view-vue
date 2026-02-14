/**
 * DataSet — 数据空间（UI↔后端 桥接层）
 *
 * 直接实现类，不再继承复杂接口
 */

import type { IDataSetMetadata, ITableMetadata, DataRelation, IDataRow, DataColumn, CrudApi } from './types'
import type { DataView as SparkDataView } from './data-view'
import { DataTable } from './data-table'
import { RelationEngine } from './core/relation-engine'
import { DependencyAnalyzer } from './core/dependency-analyzer'
import { DataLoader } from './core/data-loader'
import { SubscriptionManager } from './core/subscription-manager'
import { EventManager } from './core/event-manager'
import { DATA_SET_STATE } from '@spark-view/spark-utils'
import type { Provider as CapabilityProvider, CapabilityKey } from '@spark-view/spark-utils'

export class DataSet {
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

  /** 是否自动加载关系数据 */
  autoLoadRelations: boolean | undefined

  /** 数据加载器函数 */
  dataLoader: ((tableName: string) => Promise<IDataRow[]>) | undefined

  // ===== 内部引擎 =====

  /** 关系引擎 */
  private relationEngine: RelationEngine

  /** 依赖分析器 */
  private dependencyAnalyzer: DependencyAnalyzer

  /** 数据加载器实例 */
  private dataLoaderInstance: DataLoader

  /** 订阅管理器 */
  private subscriptionManager: SubscriptionManager

  /** 事件管理器 */
  private eventManager: EventManager

  // ===== 构造函数 =====

  /**
   * 创建数据集实例
   * @param config 数据集配置
   */
  constructor(config: {
    dataSetName: string
    tables: Record<string, ITableMetadata>
    relations: DataRelation[] | undefined
    version: number | undefined
    pageId: string | undefined
    autoLoadRelations: boolean | undefined
    dataLoader: ((tableName: string) => Promise<IDataRow[]>) | undefined
  }) {
    this.dataSetName = config.dataSetName
    this.dataLoader = config.dataLoader
    this.relations = config.relations
    this.version = config.version
    this.pageId = config.pageId
    this.autoLoadRelations = config.autoLoadRelations

    // 构建表实例
    this.tables = {}
    for (const [name, td] of Object.entries(config.tables)) {
      const table = DataTable.fromTableData(td)
      this.tables[name] = table
    }

    // 关系默认 contextId
    this.relations?.forEach(r => {
      r.parentContextId ??= 'default'
      r.childContextId ??= 'default'
    })

    // 初始化引擎
    this.dependencyAnalyzer = new DependencyAnalyzer(this)
    this.relationEngine = new RelationEngine(this)
    this.dataLoaderInstance = new DataLoader(this)
    this.subscriptionManager = new SubscriptionManager(this)
    this.eventManager = new EventManager()
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
    dataLoader?: (tableName: string) => Promise<IDataRow[]>
  }): DataSet {
    const tables: Record<string, ITableMetadata> = {}

    for (const [key, tableConfig] of Object.entries(config.tables)) {
      tables[key] = { ...tableConfig } as ITableMetadata
    }

    return new DataSet({
      dataSetName: config.dataSetName,
      tables,
      relations: config.relations,
      version: undefined,
      pageId: undefined,
      autoLoadRelations: undefined,
      dataLoader: config.dataLoader
    })
  }

  // ===== 能力注册 =====

  /**
   * 获取数据集的能力提供者
   * @param pageParams 页面参数
   * @param pagePermission 页面权限
   * @returns 能力映射
   */
  getCapabilities(
    pageParams?: Record<string, unknown>,
    pagePermission?: Record<string, boolean>
  ): Map<CapabilityKey<unknown>, CapabilityProvider> {
    const caps = new Map<CapabilityKey<unknown>, CapabilityProvider>()
    caps.set(DATA_SET_STATE as CapabilityKey<unknown>, {
      name: DATA_SET_STATE,
      implementation: {
        getDataSet: () => this,
        getTable: (name: string) => this.tables[name],
        getPageParams: () => pageParams ?? {},
        getPagePermission: () => pagePermission ?? {},
        onTableChange: (tableName: string, cb: (t: unknown) => void) => {
          const wrapped = (d: unknown) => {
            if ((d as { tableName: string }).tableName === tableName) cb(this.tables[tableName])
          }
          this.on('tableChanged', wrapped)
          return () => this.off('tableChanged', wrapped)
        },
      },
    })
    return caps
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
   * 获取数据视图
   * @param tableName 表名
   * @param contextId 数据视图ID
   * @returns 数据视图实例
   */
  getContext(tableName: string, contextId = 'default'): SparkDataView | undefined {
    const t = this.getTable(tableName)
    if (!t) return undefined
    return contextId === 'default' ? t : t.getOrCreateContext(contextId)
  }

  // ===== 关系管理 =====

  /**
   * 应用数据关系
   * @param rel 数据关系
   */
  applyRelation(rel: DataRelation): void {
    this.relationEngine.applyRelation(rel)
  }

  /**
   * 更新相关表数据
   * @param parent 父表名
   * @param ctxId 数据视图ID
   */
  updateRelatedTables(parent: string, ctxId = 'default'): void {
    this.relationEngine.updateRelatedTables(parent, ctxId)
  }

  // ===== 依赖分析 =====

  /**
   * 获取表依赖关系
   * @param tableName 表名
   * @returns 依赖表名数组
   */
  getTableDependencies(tableName: string): string[] {
    return Array.from(this.dependencyAnalyzer.getTableDependencies(tableName))
  }

  /**
   * 获取根依赖关系
   * @param tableName 表名
   * @returns 根依赖表名数组
   */
  getRootDependencies(tableName: string): string[] {
    return Array.from(this.dependencyAnalyzer.getRootDependencies(tableName))
  }

  /**
   * 检查依赖是否满足
   * @param tableName 表名
   * @returns 是否满足依赖
   */
  areDependenciesSatisfied(tableName: string): boolean {
    return this.dependencyAnalyzer.areDependenciesSatisfied(tableName)
  }

  // ===== 订阅管理 =====

  /**
   * 订阅表数据变化
   * @param tableName 表名
   * @param contextId 数据视图ID
   * @param cb 回调函数
   * @returns 取消订阅函数
   */
  subscribe(tableName: string, contextId: string, cb: () => void): () => void {
    return this.subscriptionManager.subscribe(tableName, contextId, cb)
  }

  /**
   * 通知订阅者
   * @param tableName 表名
   * @param contextId 数据视图ID
   */
  notifySubscribers(tableName: string, contextId?: string): void {
    this.subscriptionManager.notifySubscribers(tableName, contextId)
  }

  /**
   * 检查是否有订阅者
   * @param tableName 表名
   * @param contextId 数据视图ID
   * @returns 是否有订阅者
   */
  hasSubscribers(tableName: string, contextId?: string): boolean {
    return this.subscriptionManager.hasSubscribers(tableName, contextId)
  }

  // ===== 事件管理 =====

  /**
   * 监听事件
   * @param event 事件名
   * @param cb 回调函数
   */
  on(event: string, cb: (...args: unknown[]) => void): void {
    this.eventManager.on(event, cb)
  }

  /**
   * 取消监听事件
   * @param event 事件名
   * @param cb 回调函数
   */
  off(event: string, cb: (...args: unknown[]) => void): void {
    this.eventManager.off(event, cb)
  }

  /**
   * 触发事件
   * @param event 事件名
   * @param data 事件数据
   */
  emit(event: string, data: unknown): void {
    this.eventManager.emit(event, data)
  }

  // ===== 数据加载 =====

  /**
   * 请求表数据
   * @param tableName 表名
   */
  requestTableData(tableName: string): void {
    this.dataLoaderInstance.requestTableData(tableName)
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
   * @param loader 数据加载器
   * @returns 数据集实例
   */
  static fromData(data: IDataSetMetadata, loader?: (tableName: string) => Promise<IDataRow[]>): DataSet {
    return new DataSet({ ...data, dataLoader: loader, autoLoadRelations: undefined })
  }

  /**
   * 从JSON字符串创建数据集实例
   * @param json JSON字符串
   * @param loader 数据加载器
   * @returns 数据集实例
   */
  static fromJSON(json: string, loader?: (tableName: string) => Promise<IDataRow[]>): DataSet {
    return DataSet.fromData(JSON.parse(json) as IDataSetMetadata, loader)
  }
}
