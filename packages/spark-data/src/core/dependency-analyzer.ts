/**
 * 极简依赖分析器 — 分析表间父子关系
 */

import type { DataSet } from '../dataset'

export class DependencyAnalyzer {
  constructor(private dataSet: DataSet) {}

  /** 获取表的所有祖先表（递归） */
  getTableDependencies(tableName: string): Set<string> {
    const deps = new Set<string>()
    const visited = new Set<string>()

    const walk = (t: string) => {
      if (visited.has(t)) return
      visited.add(t)
      for (const r of this.dataSet.relations ?? []) {
        if (r.childTable === t && !deps.has(r.parentTable)) {
          walk(r.parentTable)
          deps.add(r.parentTable)
        }
      }
    }

    walk(tableName)
    return deps
  }

  /** 获取最上层根表 */
  getRootDependencies(tableName: string): Set<string> {
    const all = this.getTableDependencies(tableName)
    const roots = new Set<string>()
    for (const dep of Array.from(all)) {
      const hasParent = this.dataSet.relations?.some(r => r.childTable === dep)
      if (!hasParent) roots.add(dep)
    }
    return roots
  }

  /** 依赖条件是否满足 */
  areDependenciesSatisfied(tableName: string): boolean {
    const rels = this.dataSet.relations?.filter(r => r.childTable === tableName) ?? []
    if (rels.length === 0) return true

    for (const rel of rels) {
      const parent = this.dataSet.getTable(rel.parentTable)
      if (!parent?.rows?.length) return false

      const ctx = parent.getOrCreateContext(rel.parentContextId ?? 'default')
      if (rel.dependencyType === 'currentRow' && !ctx.currentRow) return false
      if (rel.dependencyType === 'selectedRows' && !ctx.selectedRows?.length) return false
    }
    return true
  }
}
