/**
 * 极简关系引擎 — 管理父子表联动
 *
 * 职责：
 * - 父表选中变化 → 清空/更新子表
 * - 递归级联清空
 * - 根据 dependencyType 获取父级数据范围
 */

import type { DataRelation, IDataRow, DependencyType, IDataView } from '../types'
import type { DataSet } from '../dataset'
import type { DataView } from '../data-view'
import { rowsEqual, isSameRow } from './utils'

export class RelationEngine {

  constructor(private dataSet: DataSet) {}

  /** 根据依赖类型获取父数据范围 */
  getParentRows(ctx: DataView | IDataView, dep: DependencyType): IDataRow[] {
    switch (dep) {
      case 'currentRow':  return ctx.currentRow ? [ctx.currentRow] : []
      case 'selectedRows': return ctx.selectedRows ?? []
      case 'allRows':      return ctx.rows ?? []
      case 'pagedRows': {
        const rows = ctx.rows ?? []
        const ps = ctx.pageSize ?? 20
        const p = ctx.page ?? 1
        return rows.slice((p - 1) * ps, p * ps)
      }
      default: return ctx.currentRow ? [ctx.currentRow] : []
    }
  }

  /**
   * 应用一条关系：父表状态 → 子表清空/保持
   *
   * 逻辑：
   *  - 父无数据 → 清空子表+递归清空后代
   *  - 父有数据 → 保持子表（数据由后端提供，前端不过滤）
   *    但会清理无效选中状态
   */
  applyRelation(rel: DataRelation): { changed: boolean; message: string } {
    const parentTable = this.dataSet.getTable(rel.parentTable)
    if (!parentTable) return { changed: false, message: `父表 ${rel.parentTable} 不存在` }

    const parentCtx = parentTable.getOrCreateContext(rel.parentContextId ?? 'default')
    const childTable = this.dataSet.getTable(rel.childTable)
    if (!childTable) return { changed: false, message: `子表 ${rel.childTable} 不存在` }

    const childCtx = childTable.getOrCreateContext(rel.childContextId ?? 'default')
    const parentRows = this.getParentRows(parentCtx, rel.dependencyType)

    // 父表无数据 → 递归清空子表
    if (!parentRows.length) {
      const had = childCtx.rows.length > 0 || childCtx.currentRow !== null
      childCtx.clearAll(true)
      if (had) {
        this.dataSet.notifySubscribers(rel.childTable, rel.childContextId ?? 'default')
        this.recursiveClear(rel.childTable, rel.childContextId ?? 'default')
        return { changed: true, message: `清空 ${rel.childTable}` }
      }
      return { changed: false, message: `${rel.childTable} 已为空` }
    }

    // 父表有数据 — 数据由后端提供，前端只做选中状态维护
    const src = childCtx.originalRows ?? []
    if (!src.length) {
      return { changed: false, message: `${rel.childTable} 无原始数据` }
    }

    // 把 originalRows 作为"后端已过滤"数据写入 rows（如果不同的话）
    if (!rowsEqual(childCtx.rows, src)) {
      childCtx.rows.splice(0, childCtx.rows.length, ...src)
    }

    // 清理无效 currentRow
    let selChanged = false
    if (childCtx.currentRow && !src.some(r => isSameRow(r, childCtx.currentRow))) {
      childCtx.currentRow = childCtx.autoSelectFirst && src.length > 0 ? (src[0] ?? null) : null
      selChanged = true
    } else if (!childCtx.currentRow && childCtx.autoSelectFirst && src.length > 0) {
      childCtx.currentRow = src[0] ?? null
      selChanged = true
    }

    // 清理无效 selectedRows
    const valid = childCtx.selectedRows.filter(r => src.some(s => isSameRow(s, r)))
    if (valid.length !== childCtx.selectedRows.length) {
      childCtx.setSelectedRows(valid, false)
      selChanged = true
    }

    if (selChanged) {
      this.updateRelatedTables(rel.childTable, rel.childContextId ?? 'default')
      this.dataSet.notifySubscribers(rel.childTable, rel.childContextId ?? 'default')
    }

    return { changed: selChanged, message: selChanged ? '选中状态已更新' : '无变化' }
  }

  /** 触发父表的所有子关系更新 */
  updateRelatedTables(parentTable: string, parentContextId: string = 'default'): void {
    for (const rel of this.dataSet.relations ?? []) {
      if (rel.parentTable !== parentTable || rel.parentContextId !== parentContextId) continue

      const childCtx = this.dataSet.getContext(rel.childTable, rel.childContextId ?? 'default')

      // autoLoad: 子表数据未加载时触发加载
      if (childCtx && rel.autoLoad && !childCtx.originalRows?.length) {
        this.dataSet.requestTableData(rel.childTable)
        continue
      }

      const result = this.applyRelation(rel)
      if (result.changed) {
        this.dataSet.notifySubscribers(rel.childTable, rel.childContextId ?? 'default')
      }
    }
  }

  /** 刷新所有关系 */
  refreshAllRelations(): void {
    for (const rel of this.dataSet.relations ?? []) {
      this.applyRelation(rel)
    }
  }

  /** 递归清空后代子表 */
  private recursiveClear(parentTable: string, parentCtxId: string): void {
    for (const rel of this.dataSet.relations ?? []) {
      if (rel.parentTable !== parentTable || (rel.parentContextId ?? 'default') !== parentCtxId) continue
      const cid = rel.childContextId ?? 'default'
      const ctx = this.dataSet.getContext(rel.childTable, cid)
      if (ctx && (ctx.rows.length > 0 || ctx.currentRow !== null)) {
        ctx.clearAll(true)
        this.dataSet.notifySubscribers(rel.childTable, cid)
        this.recursiveClear(rel.childTable, cid)
      }
    }
  }
}
