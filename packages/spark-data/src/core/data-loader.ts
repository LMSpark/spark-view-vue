/**
 * 极简数据加载器 — 智能加载表数据（依赖分析 + 防重入）
 */

import type { DataSet } from '../dataset'
import type { DataTable } from '../data-table'
import { Logger } from '@spark-view/spark-utils'
import { rowsEqual } from './utils'

export class DataLoader {
  private logger = Logger('DataLoader')
  private loading = new Set<string>()

  constructor(private ds: DataSet) {}

  /** 请求加载表数据（异步非阻塞） */
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

  /** 通知依赖更新，按需自动加载 */
  notifyDependencyUpdated(tableName: string): void {
    this.ds.emit('dependencyUpdated', { tableName })
    if (this.shouldAutoLoad(tableName) && this.ds.hasSubscribers(tableName)) {
      this.loadTable(tableName).catch(e => this.logger.error(`自动加载 ${tableName} 失败`, e))
    }
  }

  // ===== 内部 =====

  private async doLoad(tableName: string): Promise<void> {
    const table = this.ds.getTable(tableName)
    const deps = this.ds.getTableDependencies(tableName)
    const isRoot = deps.size === 0

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

  private async loadTable(tableName: string): Promise<void> {
    if (!this.ds.dataLoader) return
    const table = this.ds.getTable(tableName)
    if (table) table.setLoading()

    try {
      const rows = await this.ds.dataLoader(tableName)
      if (!table) return

      if (!rowsEqual(table.rows, rows)) {
        table.rows.splice(0, table.rows.length, ...rows)
        table.originalRows ??= [...rows]

        if (table.autoSelectFirst && rows.length > 0 && !table.currentRow) {
          table.setCurrentRow(rows[0] ?? null, false)
        }
        this.cleanupSelections(table)

        // 子表 → 重新应用父关系
        const parentRels = this.ds.relations?.filter(r => r.childTable === tableName) ?? []
        for (const rel of parentRels) this.ds.applyRelation(rel)
      }

      table.setReady()
      this.ds.notifySubscribers(tableName)
      this.notifyChildren(tableName)
    } catch (err) {
      if (table) table.setError(err instanceof Error ? err : new Error(String(err)))
      throw err
    }
  }

  private cleanupSelections(table: DataTable) {
    let dirty = table.cleanupInvalidSelections()
    for (const ctx of Object.values(table.contexts ?? {})) {
      if (ctx.cleanupInvalidSelections()) dirty = true
    }
    if (dirty) this.ds.emit('selectionCleaned', { tableName: table.hostTable })
  }

  private notifyChildren(parentTable: string) {
    for (const rel of this.ds.relations ?? []) {
      if (rel.parentTable === parentTable) {
        this.ds.emit('dependencyUpdated', { tableName: rel.childTable })
        this.notifyDependencyUpdated(rel.childTable)
      }
    }
  }

  private applyRelationsFor(tableName: string) {
    for (const rel of this.ds.relations ?? []) {
      if (rel.childTable === tableName) this.ds.applyRelation(rel)
    }
  }

  private shouldAutoLoad(tableName: string): boolean {
    for (const rel of this.ds.relations?.filter(r => r.childTable === tableName) ?? []) {
      const ctx = this.ds.getContext(rel.parentTable, rel.parentContextId)
      if (!ctx) continue
      if (rel.dependencyType === 'currentRow' && ctx.currentRow) return true
      if (rel.dependencyType === 'selectedRows' && ctx.selectedRows?.length) return true
      if (rel.dependencyType === 'allRows') return true
    }
    return false
  }
}
