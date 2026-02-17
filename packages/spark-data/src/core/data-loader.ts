/**
 * 极简数据加载器 — 智能加载表数据（依赖分析 + 防重入）
 *
 * 核心原则：
 * - 非阻塞：异步加载，不等待
 * - 简化状态：数据加载后清空选中状态，不做新旧值比较
 * - 关系定义在视图级别：依赖分析以 (tableName, viewId) 为单位
 * - 自带 DependencyAnalyzer + RelationEngine（DataSet 不暴露引擎细节）
 */

import type { DataSet } from '../dataset'
import type { DataView as SparkDataView } from '../data-view'
import { DependencyAnalyzer } from './dependency-analyzer'
import { RelationEngine } from './relation-engine'
import { Logger } from '@spark-view/spark-utils'

export class DataLoader {
  // ===== 属性定义 =====

  /** 日志记录器 */
  private logger = Logger('DataLoader')

  /** 正在加载的表集合（防重入） */
  private loading = new Set<string>()

  /** 依赖分析器（DataLoader 内部使用） */
  private depAnalyzer: DependencyAnalyzer

  /** 关系引擎（DataLoader 内部使用） */
  private relationEngine: RelationEngine

  // ===== 构造函数 =====

  /**
   * 创建数据加载器实例
   * @param ds 关联的数据集（只需树结构 + 关系元数据）
   */
  constructor(private ds: DataSet) {
    this.depAnalyzer = new DependencyAnalyzer(ds)
    this.relationEngine = new RelationEngine(ds)
  }

  // ===== 公共接口 =====

  /**
   * 请求加载表数据（异步非阻塞）
   * @param tableName 表名
   * @param viewId 视图ID
   */
  requestTableData(tableName: string, viewId: string = 'default'): void {
    const key = `${tableName}:${viewId}`
    if (this.loading.has(key)) return
    this.loading.add(key)

    this.doLoad(tableName, viewId)
      .catch((err: unknown) => {
        this.logger.error(`加载 ${tableName}:${viewId} 失败`, err)
      })
      .finally(() => this.loading.delete(key))
  }

  // ===== 内部实现 =====

  /**
   * 通知依赖更新，按需自动加载
   */
  private notifyDependencyUpdated(tableName: string, viewId: string = 'default'): void {
    if (this.shouldAutoLoad(tableName, viewId) && this.hasSubscribers(tableName, viewId)) {
      this.loadTable(tableName).catch(e => this.logger.error(`自动加载 ${tableName} 失败`, e))
    }
  }

  /**
   * 执行数据加载逻辑
   */
  private async doLoad(tableName: string, viewId: string): Promise<void> {
    const table = this.ds.getTable(tableName)
    const deps = this.depAnalyzer.getViewDependencies(tableName, viewId)
    const isRoot = deps.length === 0

    const view = table?.views['default']

    // 根视图已有数据 → 直接通知
    if (isRoot && view?.rows?.length) {
      this.notifyTableSubscribers(tableName)
      return
    }

    // 依赖视图已有数据 → 重新应用关系
    if (!isRoot && view?.rows?.length) {
      if (this.depAnalyzer.areDependenciesSatisfied(tableName, viewId)) {
        this.applyRelationsFor(tableName, viewId)
        this.notifyTableSubscribers(tableName)
        return
      }
    }

    // 依赖满足？
    if (this.depAnalyzer.areDependenciesSatisfied(tableName, viewId)) {
      if (isRoot) {
        await this.loadTable(tableName)
      } else {
        if (table && !view?.originalRows) await this.loadTable(tableName)
        this.applyRelationsFor(tableName, viewId)
        this.notifyTableSubscribers(tableName)
      }
      return
    }

    // 依赖不满足 → 先加载根视图对应的表
    const roots = this.depAnalyzer.getRootDependencies(tableName, viewId)
    for (const root of roots) {
      const rt = this.ds.getTable(root.tableName)
      const rv = rt?.getOrCreateView(root.viewId)
      if (!rv?.rows?.length) await this.loadTable(root.tableName)
    }
    this.notifyDependencyUpdated(tableName, viewId)
  }

  /**
   * 加载单个表数据
   */
  private async loadTable(tableName: string): Promise<void> {
    if (!this.ds.dataLoader) return
    const table = this.ds.getTable(tableName)
    const view = table?.views['default']
    if (view) view.setLoading()

    try {
      const rows = await this.ds.dataLoader(tableName)
      if (!table || !view) return

      // 直接替换数据
      view.rows.splice(0, view.rows.length, ...rows)
      view.originalRows ??= [...rows]

      // 清空所有视图的选中状态
      for (const v of Object.values(table.views ?? {})) {
        v.currentRow = null
        v.currentRowIndex = null
        v.selectedRows.splice(0)
        v.selectedRowIndices = []
      }

      // 子视图 → 重新应用父关系
      const parentRels = this.ds.relations?.filter(r => r.childTable === tableName) ?? []
      for (const rel of parentRels) this.relationEngine.applyRelation(rel)

      table.views['default']?.setReady()
      this.notifyTableSubscribers(tableName)
      this.notifyChildren(tableName)
    } catch (err) {
      if (table) table.views['default']?.setError(err instanceof Error ? err : new Error(String(err)))
      throw err
    }
  }

  // ===== 辅助方法（直接操作树节点，不经过 DataSet 委托） =====

  /** 通知表的所有视图订阅者 */
  private notifyTableSubscribers(tableName: string): void {
    const table = this.ds.getTable(tableName)
    if (table) table.notifySubscribers()
  }

  /** 检查视图是否有订阅者 */
  private hasSubscribers(tableName: string, viewId: string): boolean {
    const table = this.ds.getTable(tableName)
    if (!table) return false
    return table.hasSubscribers(viewId)
  }

  /** 通知子视图依赖更新 */
  private notifyChildren(parentTable: string) {
    for (const rel of this.ds.relations ?? []) {
      if (rel.parentTable === parentTable) {
        this.notifyDependencyUpdated(rel.childTable, rel.childViewId ?? 'default')
      }
    }
  }

  /** 为指定视图应用父关系 */
  private applyRelationsFor(tableName: string, viewId: string) {
    for (const rel of this.ds.relations ?? []) {
      if (rel.childTable === tableName && (rel.childViewId ?? 'default') === viewId) {
        this.relationEngine.applyRelation(rel)
      }
    }
  }

  /** 判断是否应该自动加载视图数据 */
  private shouldAutoLoad(tableName: string, viewId: string): boolean {
    const rels = (this.ds.relations ?? []).filter(
      r => r.childTable === tableName && (r.childViewId ?? 'default') === viewId
    )
    for (const rel of rels) {
      const view: SparkDataView | undefined = this.ds.getView(rel.parentTable, rel.parentViewId)
      if (!view) continue
      if (rel.dependencyType === 'currentRow' && view.currentRow) return true
      if (rel.dependencyType === 'selectedRows' && view.selectedRows?.length) return true
      if (rel.dependencyType === 'allRows') return true
    }
    return false
  }
}
