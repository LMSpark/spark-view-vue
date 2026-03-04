/**
 * el-pagination 规则绑定委托
 *
 * 职责：
 *  - dataKey → DataView 分页属性注入（currentPage / pageSize / total）
 *  - UI → DataSet 事件双向绑定（current-change / size-change → setPage / setPageSize）
 *  - 合理默认布局（layout / pageSizes，用户配置可覆盖）
 *
 * 配置示例（rule.json）：
 * ```json
 * {
 *   "type": "el-pagination",
 *   "dataKey": "DS@Orders@default@rows",
 *   "props": {
 *     "layout": "total, sizes, prev, pager, next",
 *     "pageSizes": [10, 20, 50, 100]
 *   }
 * }
 * ```
 */

import type { Rule } from '../types'
import type { IDataSet } from '@spark-view/spark-data'
import { parseDataKey } from '@spark-view/spark-data'
import { setRuleProp, pageLogger } from './bind-helpers'

/**
 * 为 el-pagination 注入 DataView 分页绑定（双向）
 *
 * Props 方向：DataView.page / pageSize / total → el-pagination
 * 事件方向：current-change / size-change → DataView.setPage / setPageSize
 */
export function bindPaginationRule(
  rule: Rule,
  dataSet: IDataSet | null
): void {
  const rawKey = rule['dataKey'] as string | undefined
  if (!rawKey || !dataSet) return

  const dk = parseDataKey(rawKey)
  if (!dk) return

  const { tableName, viewId } = dk
  const table = dataSet.getTable(tableName)
  if (!table) return
  const view = table.getOrCreateView(viewId)

  // 给 pagination 一个 name 供 formApi 查找
  rule.name ??= `pagination_${tableName}_${viewId}`

  // 绑定分页属性（DataView 是 reactive proxy，属性读取会创建 Vue 响应式依赖）
  setRuleProp(rule, 'currentPage', view.page)
  setRuleProp(rule, 'pageSize', view.pageSize)
  setRuleProp(rule, 'total', view.total)

  // 设置合理默认布局（用户配置覆盖）
  rule.props ??= {}
  rule.props['layout'] ??= 'total, sizes, prev, pager, next'
  rule.props['pageSizes'] ??= [10, 20, 50, 100]

  // ── 注入事件 ──
  rule.on ??= {}

  const originalCurrentChange = rule.on['currentChange']
  rule.on['currentChange'] = (page: number) => {
    pageLogger.debug(`[PaginationEvent] currentChange`, { tableName, viewId, page })
    if (typeof originalCurrentChange === 'function') {
      (originalCurrentChange as (p: number) => void)(page)
    }
    void view.setPage(page)
  }

  const originalSizeChange = rule.on['sizeChange']
  rule.on['sizeChange'] = (size: number) => {
    pageLogger.debug(`[PaginationEvent] sizeChange`, { tableName, viewId, size })
    if (typeof originalSizeChange === 'function') {
      (originalSizeChange as (s: number) => void)(size)
    }
    void view.setPageSize(size)
  }
}
