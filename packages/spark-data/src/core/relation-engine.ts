/**
 * 极简关系引擎 — 管理视图间联动
 *
 * 核心原则（SOLID）：
 * - 关系建立在视图（view/context）之间，不是表
 * - 非阻塞数据流：向上只请求不等待，向下只通知
 * - 简化状态管理：不做新旧值比较，不维护选中状态
 * - 单一职责：只负责关系逻辑，数据加载由 DataLoader 处理
 */

import type { DataRelation, IDataRow, DependencyType } from '../types'
import type { DataSet } from '../dataset'
import type { DataView as SparkDataView } from '../data-view'

export class RelationEngine {
  // ===== 构造函数 =====

  /**
   * 创建关系引擎实例
   * @param dataSet 关联的数据集
   */
  constructor(private dataSet: DataSet) {}

  // ===== 父数据获取 =====

  /**
   * 根据依赖类型获取父数据范围（用于构建查询参数）
   * @param ctx 父视图
   * @param dep 依赖类型
   * @returns 父数据行数组
   */
  getParentRows(ctx: SparkDataView, dep: DependencyType): IDataRow[] {
    switch (dep) {
      case 'currentRow':   return ctx.currentRow ? [ctx.currentRow] : []
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

  // ===== 关系应用 =====

  /**
   * 应用关系：父视图变化 → 子视图响应（非阻塞）
   *
   * 数据流原则：
   *  - 父视图无数据 → 清空子视图（递归）
   *  - 父视图有数据 → 非阻塞请求子视图数据（autoLoad控制）
   *  - 不做状态比较，不维护选中状态
   * @param rel 数据关系
   */
  applyRelation(rel: DataRelation): void {
    const parentCtx = this.dataSet.getContext(rel.parentTable, rel.parentContextId ?? 'default')
    if (!parentCtx) return

    const childCtx = this.dataSet.getContext(rel.childTable, rel.childContextId ?? 'default')
    if (!childCtx) return

    const parentRows = this.getParentRows(parentCtx, rel.dependencyType)

    // 父视图无数据 → 递归清空子视图
    if (!parentRows.length) {
      childCtx.clearAll(true)
      this.dataSet.notifySubscribers(rel.childTable, rel.childContextId ?? 'default')
      this.recursiveClear(rel.childTable, rel.childContextId ?? 'default')
      return
    }

    // 父视图有数据 → 非阻塞请求子视图数据
    if (rel.autoLoad) {
      this.dataSet.requestTableData(rel.childTable)
    }
  }

  /**
   * 父视图变化时触发所有子关系响应
   * @param parentTable 父表名
   * @param parentContextId 父视图ID
   */
  updateRelatedTables(parentTable: string, parentContextId: string = 'default'): void {
    for (const rel of this.dataSet.relations ?? []) {
      if (rel.parentTable === parentTable && (rel.parentContextId ?? 'default') === parentContextId) {
        this.applyRelation(rel)
      }
    }
  }

  /**
   * 刷新所有关系
   */
  refreshAllRelations(): void {
    for (const rel of this.dataSet.relations ?? []) {
      this.applyRelation(rel)
    }
  }

  // ===== 私有方法 =====

  /**
   * 递归清空后代视图
   * @param parentTable 父表名
   * @param parentCtxId 父视图ID
   */
  private recursiveClear(parentTable: string, parentCtxId: string): void {
    for (const rel of this.dataSet.relations ?? []) {
      if (rel.parentTable === parentTable && (rel.parentContextId ?? 'default') === parentCtxId) {
        const cid = rel.childContextId ?? 'default'
        const ctx = this.dataSet.getContext(rel.childTable, cid)
        if (ctx) {
          ctx.clearAll(true)
          this.dataSet.notifySubscribers(rel.childTable, cid)
          this.recursiveClear(rel.childTable, cid)
        }
      }
    }
  }
}
