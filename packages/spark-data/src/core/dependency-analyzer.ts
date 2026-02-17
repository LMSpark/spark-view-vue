/**
 * 极简依赖分析器 — 分析视图间父子关系
 *
 * 关系定义在视图级别：parentTable:parentViewId → childTable:childViewId
 * 所有查询均以 (tableName, viewId) 为单位
 */

import type { DataSet } from '../dataset'

/** 视图标识：tableName + viewId */
export interface ViewRef {
  tableName: string
  viewId: string
}

export class DependencyAnalyzer {
  // ===== 构造函数 =====

  /**
   * 创建依赖分析器实例
   * @param dataSet 关联的数据集
   */
  constructor(private dataSet: DataSet) {}

  // ===== 依赖分析 =====

  /**
   * 获取视图的所有祖先视图（递归）
   * @param tableName 表名
   * @param viewId 视图ID
   * @returns 祖先视图引用集合
   */
  getViewDependencies(tableName: string, viewId: string = 'default'): ViewRef[] {
    const deps: ViewRef[] = []
    const visited = new Set<string>()

    const key = (t: string, c: string) => `${t}:${c}`

    const walk = (t: string, c: string) => {
      const k = key(t, c)
      if (visited.has(k)) return
      visited.add(k)
      for (const r of this.dataSet.relations ?? []) {
        const childViewId = r.childViewId ?? 'default'
        if (r.childTable === t && childViewId === c) {
          const parentViewId = r.parentViewId ?? 'default'
          const pk = key(r.parentTable, parentViewId)
          if (!visited.has(pk)) {
            walk(r.parentTable, parentViewId)
            deps.push({ tableName: r.parentTable, viewId: parentViewId })
          }
        }
      }
    }

    walk(tableName, viewId)
    return deps
  }

  /**
   * 获取最上层根视图（无父关系的祖先）
   * @param tableName 表名
   * @param viewId 视图ID
   * @returns 根视图引用数组
   */
  getRootDependencies(tableName: string, viewId: string = 'default'): ViewRef[] {
    const all = this.getViewDependencies(tableName, viewId)
    return all.filter(dep => {
      // 如果该视图没有任何关系以它为子，则是根
      return !(this.dataSet.relations ?? []).some(
        r => r.childTable === dep.tableName && (r.childViewId ?? 'default') === dep.viewId
      )
    })
  }

  /**
   * 检查视图的依赖条件是否满足
   * @param tableName 表名
   * @param viewId 视图ID
   * @returns 依赖是否满足
   */
  areDependenciesSatisfied(tableName: string, viewId: string = 'default'): boolean {
    const rels = (this.dataSet.relations ?? []).filter(
      r => r.childTable === tableName && (r.childViewId ?? 'default') === viewId
    )
    if (rels.length === 0) return true

    for (const rel of rels) {
      const parentViewId = rel.parentViewId ?? 'default'
      const parentView = this.dataSet.getView(rel.parentTable, parentViewId)
      if (!parentView?.rows?.length) return false

      if (rel.dependencyType === 'currentRow' && !parentView.currentRow) return false
      if (rel.dependencyType === 'selectedRows' && !parentView.selectedRows?.length) return false
    }
    return true
  }
}
