/**
 * 极简数据加载器 — 智能加载表数据（依赖分析 + 防重入）
 *
 * 核心原则：
 * - 非阻塞：异步加载，不等待
 * - 简化状态：数据加载后清空选中状态，不做新旧值比较
 */

import type { DataSet } from '../dataset'
import type { DataView as SparkDataView } from '../data-view'
import { Logger } from '@spark-view/spark-utils'

export class DataLoader {
  // ===== 属性定义 =====

  /** 日志记录器 */
  private logger = Logger('DataLoader')

  /** 正在加载的表集合（防重入） */
  private loading = new Set<string>()

  // ===== 构造函数 =====

  /**
   * 创建数据加载器实例
   * @param ds 关联的数据集
   */
  constructor(private ds: DataSet) {}

  // ===== 公共接口 =====

  /**
   * 请求加载表数据（异步非阻塞）
   * @param tableName 表名
   */
  requestTableData(tableName: string): void {
    if (this.loading.has(tableName)) return
    this.ds.emit('loadStart', { tableName })
    this.loading.add(tableName)

    this.doLoad(tableName)
      .catch((err: unknown) => {
        this.logger.error(`加载 ${tableName} 失败`, err)
        this.ds.emit('loadError', { tableName, error: err })
      })
      .finally(() => this.loading.delete(tableName))
  }

  /**
   * 通知依赖更新，按需自动加载
   * @param tableName 表名
   */
  notifyDependencyUpdated(tableName: string): void {
    this.ds.emit('dependencyUpdated', { tableName })
    if (this.shouldAutoLoad(tableName) && this.ds.hasSubscribers(tableName)) {
      this.loadTable(tableName).catch(e => this.logger.error(`自动加载 ${tableName} 失败`, e))
    }
  }

  // ===== 内部实现 =====

  /**
   * 执行数据加载逻辑
   * @param tableName 表名
   */
  private async doLoad(tableName: string): Promise<void> {
    const table = this.ds.getTable(tableName)
    const deps = this.ds.getTableDependencies(tableName)
    const isRoot = deps.length === 0

    // 根表已有数据 → 直接通知
    if (isRoot && table?.rows?.length) {
      this.ds.notifySubscribers(tableName)
      this.ds.emit('loadSuccess', { tableName })
      return
    }

    // 依赖表已有数据 → 重新应用关系
    if (!isRoot && table?.rows?.length) {
      if (this.ds.areDependenciesSatisfied(tableName)) {
        this.applyRelationsFor(tableName)
        this.ds.notifySubscribers(tableName)
        this.ds.emit('loadSuccess', { tableName })
        return
      }
    }

    // 依赖满足？
    if (this.ds.areDependenciesSatisfied(tableName)) {
      if (isRoot) {
        await this.loadTable(tableName)
      } else {
        if (table && !table.originalRows) await this.loadTable(tableName)
        this.applyRelationsFor(tableName)
        this.ds.notifySubscribers(tableName)
      }
      this.ds.emit('loadSuccess', { tableName })
      return
    }

    // 依赖不满足 → 先加载根表
    const roots = this.ds.getRootDependencies(tableName)
    for (const root of roots) {
      const rt = this.ds.getTable(root)
      if (!rt?.rows?.length) await this.loadTable(root)
    }
    this.notifyDependencyUpdated(tableName)
  }

  /**
   * 加载单个表数据
   * @param tableName 表名
   */
  private async loadTable(tableName: string): Promise<void> {
    if (!this.ds.dataLoader) return
    const table = this.ds.getTable(tableName)
    if (table) table.setLoading()

    try {
      const rows = await this.ds.dataLoader(tableName)
      if (!table) return

      // 直接替换数据，不做新旧值比较
      table.rows.splice(0, table.rows.length, ...rows)
      table.originalRows ??= [...rows]

      // 清空选中状态（核心原则：数据加载后重置状态）
      if (table.currentRow !== null || table.selectedRows.length > 0) {
        table.currentRow = null
        table.selectedRows.splice(0)
        table.selectedRowIndices.splice(0)
      }

      // 清空所有视图的选中状态
      for (const ctx of Object.values(table.contexts ?? {})) {
        if (ctx.currentRow !== null || ctx.selectedRows.length > 0) {
          ctx.currentRow = null
          ctx.selectedRows.splice(0)
          ctx.selectedRowIndices.splice(0)
        }
      }

      // 子表 → 重新应用父关系
      const parentRels = this.ds.relations?.filter(r => r.childTable === tableName) ?? []
      for (const rel of parentRels) this.ds.applyRelation(rel)

      table.setReady()
      this.ds.notifySubscribers(tableName)
      this.notifyChildren(tableName)
    } catch (err) {
      if (table) table.setError(err instanceof Error ? err : new Error(String(err)))
      throw err
    }
  }

  /**
   * 通知子表依赖更新
   * @param parentTable 父表名
   */
  private notifyChildren(parentTable: string) {
    for (const rel of this.ds.relations ?? []) {
      if (rel.parentTable === parentTable) {
        this.ds.emit('dependencyUpdated', { tableName: rel.childTable })
        this.notifyDependencyUpdated(rel.childTable)
      }
    }
  }

  /**
   * 为指定表应用关系
   * @param tableName 表名
   */
  private applyRelationsFor(tableName: string) {
    for (const rel of this.ds.relations ?? []) {
      if (rel.childTable === tableName) this.ds.applyRelation(rel)
    }
  }

  /**
   * 判断是否应该自动加载表数据
   * @param tableName 表名
   * @returns 是否应该自动加载
   */
  private shouldAutoLoad(tableName: string): boolean {
    for (const rel of this.ds.relations?.filter(r => r.childTable === tableName) ?? []) {
      const ctx: SparkDataView | undefined = this.ds.getContext(rel.parentTable, rel.parentContextId)
      if (!ctx) continue
      if (rel.dependencyType === 'currentRow' && ctx.currentRow) return true
      if (rel.dependencyType === 'selectedRows' && ctx.selectedRows?.length) return true
      if (rel.dependencyType === 'allRows') return true
    }
    return false
  }
}
