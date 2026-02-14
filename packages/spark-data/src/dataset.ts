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
  // 基础属性
  dataSetName: string
  tables: Record<string, DataTable> = {}
  relations: DataRelation[] | undefined
  version: number | undefined
  pageId: string | undefined
  autoLoadRelations: boolean | undefined
  dataLoader: ((tableName: string) => Promise<IDataRow[]>) | undefined

  // 内部引擎
  private relationEngine: RelationEngine
  private dependencyAnalyzer: DependencyAnalyzer
  private dataLoaderInstance: DataLoader
  private subscriptionManager: SubscriptionManager
  private eventManager: EventManager

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

  // ===== 工厂方法（支持 SparkData 命名空间） =====

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

    return new DataSet({ ...config })
  }

  static fromMetadata(metadata: IDataSetMetadata): DataSet {
    return new DataSet({ ...metadata, autoLoadRelations: undefined, dataLoader: undefined })
  }

  // ===== 能力注册 =====

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

  getTable(name: string): DataTable | undefined {
    return this.tables[name]
  }

  getContext(tableName: string, contextId = 'default'): SparkDataView | undefined {
    const t = this.getTable(tableName)
    if (!t) return undefined
    return contextId === 'default' ? t : t.getOrCreateContext(contextId)
  }

  // ===== 关系 =====

  applyRelation(rel: DataRelation): void {
    this.relationEngine.applyRelation(rel)
  }

  updateRelatedTables(parent: string, ctxId = 'default'): void {
    this.relationEngine.updateRelatedTables(parent, ctxId)
  }

  // ===== 依赖 =====

  getTableDependencies(tableName: string): string[] {
    return Array.from(this.dependencyAnalyzer.getTableDependencies(tableName))
  }

  getRootDependencies(tableName: string): string[] {
    return Array.from(this.dependencyAnalyzer.getRootDependencies(tableName))
  }

  areDependenciesSatisfied(tableName: string): boolean {
    return this.dependencyAnalyzer.areDependenciesSatisfied(tableName)
  }

  // ===== 订阅 =====

  subscribe(tableName: string, contextId: string, cb: () => void): () => void {
    return this.subscriptionManager.subscribe(tableName, contextId, cb)
  }

  notifySubscribers(tableName: string, contextId?: string): void {
    this.subscriptionManager.notifySubscribers(tableName, contextId)
  }

  hasSubscribers(tableName: string, contextId?: string): boolean {
    return this.subscriptionManager.hasSubscribers(tableName, contextId)
  }

  // ===== 事件 =====

  on(event: string, cb: (...args: unknown[]) => void): void {
    this.eventManager.on(event, cb)
  }

  off(event: string, cb: (...args: unknown[]) => void): void {
    this.eventManager.off(event, cb)
  }

  emit(event: string, data: unknown): void {
    this.eventManager.emit(event, data)
  }

  // ===== 数据加载 =====

  requestTableData(tableName: string): void {
    this.dataLoaderInstance.requestTableData(tableName)
  }

  // ===== 序列化 =====

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

  toJSON(): string {
    return JSON.stringify(this.toData(), null, 2)
  }

  // ===== 工厂方法 =====

  static fromData(data: IDataSetMetadata, loader?: (tableName: string) => Promise<IDataRow[]>): DataSet {
    return new DataSet({ ...data, dataLoader: loader, autoLoadRelations: undefined })
  }

  static fromJSON(json: string, loader?: (tableName: string) => Promise<IDataRow[]>): DataSet {
    return DataSet.fromData(JSON.parse(json) as IDataSetMetadata, loader)
  }
}
