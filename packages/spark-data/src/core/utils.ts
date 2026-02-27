/**
 * spark-data 内部工具函数
 */

import type { IDataRow, DependencyType } from '../types'
import type { DataView } from '../data-view'

/** DataKey 分隔符，名称中禁止包含 */
const SEPARATOR = '@'

/**
 * 校验名称中不含 DataKey 分隔符 '@'
 * @throws 如果名称含 '@'
 * @internal
 */
export function assertNoSeparator(value: string, label: string): void {
  if (value.includes(SEPARATOR)) {
    throw new Error(`${label} 不允许包含 '${SEPARATOR}' 分隔符: "${value}"`)
  }
}

/**
 * 通过主键或引用比较判断两行是否相同
 * 
 * @param row1 第一行数据
 * @param row2 第二行数据
 * @param idField 主键字段名（支持单主键字符串或多主键数组）
 * @returns 是否相同
 */
export function isSameRow(
  row1: IDataRow | null, 
  row2: IDataRow | null, 
  idField: string | string[]
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
 * 构建行主键集合（O(n)）
 *
 * @param rows 数据行数组
 * @param getPk 获取主键值的函数
 * @returns 主键值集合
 */
export function buildPkSet(
  rows: IDataRow[],
  getPk: (row: IDataRow) => string | number | undefined,
): Set<string | number> {
  const set = new Set<string | number>()
  for (const r of rows) {
    const pk = getPk(r)
    if (pk !== undefined) set.add(pk)
  }
  return set
}

/**
 * 从选中状态中移除不在 validPkSet 中的项（纯状态操作，不发射事件）
 *
 * 供 LocalMutationDelegate（静默清理）和 SelectionDelegate（清理+发事件）共用。
 *
 * @returns 哪些状态被清理了
 */
export function pruneInvalidSelections(
  state: { _currentRowId: string | number | null; _selectedRowIds: Array<string | number> },
  validPkSet: ReadonlySet<string | number>,
): { currentRowPruned: boolean; selectedRowsPruned: boolean } {
  let currentRowPruned = false
  let selectedRowsPruned = false

  if (state._currentRowId !== null && !validPkSet.has(state._currentRowId)) {
    state._currentRowId = null
    currentRowPruned = true
  }

  if (state._selectedRowIds.length > 0) {
    const validIds = state._selectedRowIds.filter(id => validPkSet.has(id))
    if (validIds.length !== state._selectedRowIds.length) {
      state._selectedRowIds.splice(0, state._selectedRowIds.length, ...validIds)
      selectedRowsPruned = true
    }
  }

  return { currentRowPruned, selectedRowsPruned }
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
