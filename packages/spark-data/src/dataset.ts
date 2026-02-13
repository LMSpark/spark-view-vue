/**
 * DataSet — 数据空间（UI↔后端 桥接层）
 *
 * 职责：
 * 1. 维护表结构和关系定义
 * 2. 管理 UI 状态（选中、分页）
 * 3. 调度数据加载
 * 4. 事件 + 订阅通知
 *
 * 不负责：前端过滤/排序/级联写操作（全部由后端完成）
 */

import type {
  IDataSet, IDataSetMetadata, IDataSetConfig, ITableMetadata,
  DataRelation, IDataRow
} from './types'
import { DataTable } from './data-table'
import { DataView } from './data-view'
import { RelationEngine } from './core/relation-engine'
import { DependencyAnalyzer } from './core/dependency-analyzer'
import { DataLoader } from './core/data-loader'
import { SubscriptionManager } from './core/subscription-manager'
import { EventManager } from './core/event-manager'
import { DATA_SET_STATE } from '@spark-view/spark-utils'
import type { Provider as CapabilityProvider, CapabilityKey } from '@spark-view/spark-utils'

export class DataSet implements IDataSet {
  dataSetName: string
  tables: Record<string, DataTable>
  relations?: DataRelation[]
  version?: number
  pageId?: string
  autoLoadRelations?: boolean
  dataLoader?: (tableName: string) => Promise<IDataRow[]>
  private relationEngine: RelationEngine
  private dependencyAnalyzer: DependencyAnalyzer
  private dataLoaderInstance: DataLoader
  private subscriptionManager: SubscriptionManager
  private eventManager: EventManager

  constructor(config: IDataSetConfig) {
    this.dataSetName = config.dataSetName
    this.dataLoader = config.dataLoader
    this.relations = config.relations
    this.version = config.version
    this.pageId = config.pageId
    this.autoLoadRelations = config.autoLoadRelations

    // 构建表实例
    this.tables = {}
    for (const [name, td] of Object.entries(config.tables)) {
      const table = DataTable.fromTableData(td, this)
      table.setDataSet(this)
      for (const ctx of Object.values(table.contexts ?? {})) {
        ctx.setDataSet(this)
      }
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

  getTable(name: string): DataTable | undefined { return this.tables[name] }

  getContext(tableName: string, contextId = 'default'): DataView | undefined {
    const t = this.getTable(tableName)
    if (!t) return undefined
    return contextId === 'default' ? t : t.getOrCreateContext(contextId)
  }

  // ===== 关系 =====

  applyRelation(rel: DataRelation) { return this.relationEngine.applyRelation(rel) }
  updateRelatedTables(parent: string, ctxId = 'default') { this.relationEngine.updateRelatedTables(parent, ctxId) }
  refreshAllRelations() { this.relationEngine.refreshAllRelations() }

  // ===== 依赖 =====

  getTableDependencies(t: string) { return this.dependencyAnalyzer.getTableDependencies(t) }
  getRootDependencies(t: string) { return this.dependencyAnalyzer.getRootDependencies(t) }
  areDependenciesSatisfied(t: string) { return this.dependencyAnalyzer.areDependenciesSatisfied(t) }

  // ===== 数据加载 =====

  requestTableData(t: string) { this.dataLoaderInstance.requestTableData(t) }
  notifyDependencyUpdated(t: string) { this.dataLoaderInstance.notifyDependencyUpdated(t) }

  // ===== 事件 =====

  on(event: string, cb: (...args: unknown[]) => void) { this.eventManager.on(event, cb) }
  off(event: string, cb: (...args: unknown[]) => void) { this.eventManager.off(event, cb) }
  emit(event: string, data: unknown) { this.eventManager.emit(event, data) }

  // ===== 订阅 =====

  subscribe(tableName: string, contextId = 'default', cb: () => void) {
    return this.subscriptionManager.subscribe(tableName, contextId, cb)
  }
  notifySubscribers(tableName: string, contextId?: string) {
    this.subscriptionManager.notifySubscribers(tableName, contextId)
  }
  hasSubscribers(tableName: string, contextId?: string) {
    return this.subscriptionManager.hasSubscribers(tableName, contextId)
  }

  // ===== 序列化 =====

  toData(): IDataSetMetadata {
    const tables: Record<string, ITableMetadata> = {}
    for (const [n, t] of Object.entries(this.tables)) tables[n] = t.toData()
    return { dataSetName: this.dataSetName, tables, relations: this.relations, version: this.version, pageId: this.pageId }
  }

  toJSON(): string { return JSON.stringify(this.toData(), null, 2) }

  static fromData(data: IDataSetMetadata, loader?: (t: string) => Promise<IDataRow[]>): DataSet {
    return new DataSet({ ...data, dataLoader: loader })
  }

  static fromJSON(json: string, loader?: (t: string) => Promise<IDataRow[]>): DataSet {
    return DataSet.fromData(JSON.parse(json) as IDataSetMetadata, loader)
  }
}
