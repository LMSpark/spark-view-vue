/**
 * 极简关系引擎 — 管理视图间联动
 *
 * 核心原则（SOLID）：
 * - 关系建立在视图之间，不是表
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
    const parentView = this.dataSet.getView(rel.parentTable, rel.parentViewId ?? 'default')
    if (!parentView) return

    const childView = this.dataSet.getView(rel.childTable, rel.childViewId ?? 'default')
    if (!childView) return

    const parentRows = this.getParentRows(parentView, rel.dependencyType)

    // 父视图无数据 → 静默重置子视图 → 直接通知子视图订阅者
    if (!parentRows.length) {
      childView.resetState()
      childView.notifySubscribers()
      this.recursiveClear(rel.childTable, rel.childViewId ?? 'default')
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
   * @param parentViewId 父视图ID
   */
  updateRelatedTables(parentTable: string, parentViewId: string = 'default'): void {
    for (const rel of this.dataSet.relations ?? []) {
      if (rel.parentTable === parentTable && (rel.parentViewId ?? 'default') === parentViewId) {
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
   * @param parentViewId 父视图ID
   */
  private recursiveClear(parentTable: string, parentViewId: string): void {
    for (const rel of this.dataSet.relations ?? []) {
      if (rel.parentTable === parentTable && (rel.parentViewId ?? 'default') === parentViewId) {
        const cid = rel.childViewId ?? 'default'
        const view = this.dataSet.getView(rel.childTable, cid)
        if (view) {
          view.resetState()
          view.notifySubscribers()
          this.recursiveClear(rel.childTable, cid)
        }
      }
    }
  }
}
