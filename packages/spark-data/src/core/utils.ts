/**
 * spark-data 内部工具函数
 */

import type { IDataRow, DependencyType } from '../types'
import type { DataView } from '../data-view'

/**
 * 通过主键或引用比较判断两行是否相同
 * 
 * @param row1 第一行数据
 * @param row2 第二行数据
 * @param idField 主键字段名（支持单主键字符串或多主键数组），默认 'id'
 * @returns 是否相同
 */
export function isSameRow(
  row1: IDataRow | null, 
  row2: IDataRow | null, 
  idField: string | string[] = 'id'
): boolean {
  if (row1 === row2) return true
  if (!row1 || !row2) return false
  
  // 单主键比较
  if (typeof idField === 'string') {
    if (idField in row1 && idField in row2) {
      return row1[idField] === row2[idField]
    }
    return false
  }
  
  // 多主键比较（所有主键字段值都相等才视为同一行）
  if (Array.isArray(idField)) {
    for (const field of idField) {
      if (!(field in row1) || !(field in row2)) return false
      if (row1[field] !== row2[field]) return false
    }
    return true
  }
  
  return false
}

/**
 * 根据依赖类型获取源视图的数据范围
 * @param sourceView 源视图
 * @param dep 依赖类型
 * @returns 数据行数组
 */
export function getParentRows(sourceView: DataView, dep: DependencyType): IDataRow[] {
  switch (dep) {
    case 'currentRow':   return sourceView.currentRow ? [sourceView.currentRow] : []
    case 'selectedRows': return sourceView.selectedRows ?? []
    case 'allRows':      return sourceView.rows ?? []
    case 'pagedRows': {
      const rows = sourceView.rows ?? []
      const ps = sourceView.pageSize ?? 20
      const p = sourceView.page ?? 1
      return rows.slice((p - 1) * ps, p * ps)
    }
    default: return sourceView.currentRow ? [sourceView.currentRow] : []
  }
}
