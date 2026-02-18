/**
 * 极简关系引擎 — 管理视图间联动
 *
 * 核心原则（SOLID）：
 * - 关系建立在视图之间，不是表
 * - 非阻塞数据流：向上只请求不等待，向下只通知
 * - 简化状态管理：不做新旧值比较，不维护选中状态
 * - 单一职责：只负责关系逻辑，数据加载由 DataLoader 处理
 */

import type { DataRelation } from '../types'
import type { DataSet } from '../dataset'
import { getParentRows } from './utils'

export class RelationEngine {
  constructor(private dataSet: DataSet) {}

  /**
   * 应用关系：父视图变化 → 子视图响应（非阻塞）
   *
   * - 父视图无数据 → 清空子视图（递归）
   * - 父视图有数据 → 子视图主动调用自己的 loadFromServer（autoLoad控制）
   */
  applyRelation(rel: DataRelation): void {
    const parentView = this.dataSet.getView(rel.parentTable, rel.parentViewId ?? 'default')
    if (!parentView) return

    const childView = this.dataSet.getView(rel.childTable, rel.childViewId ?? 'default')
    if (!childView) return

    const parentRows = getParentRows(parentView, rel.dependencyType)

    if (!parentRows.length) {
      childView.resetState()
      childView.notifySubscribers()
      this.recursiveClear(rel.childTable, rel.childViewId ?? 'default')
      return
    }

    if (rel.autoLoad) {
      // 子视图主动加载（视图主动模式）
      childView.loadFromServer().catch(err => {
        console.error(`RelationEngine: 加载 ${rel.childTable}:${rel.childViewId ?? 'default'} 失败`, err)
      })
    }
  }

  /**
   * 递归清空后代视图
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
