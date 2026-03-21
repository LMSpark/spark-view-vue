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
 *   "dataKey": "Orders@rows",
 *   "props": {
 *     "layout": "total, sizes, prev, pager, next",
 *     "pageSizes": [10, 20, 50, 100]
 *   }
 * }
 * ```
 */

import type { BindRule } from '../types'
import type { IDataSet } from '@spark-view/spark-data'
import { parseDataKey } from '@spark-view/spark-data'
import { pageLogger, definePropertyGetter } from './bind-helpers'
import { wrapEvent } from './wrapEvent'

/**
 * 为 el-pagination 注入 DataView 分页绑定（双向）
 *
 * Props 方向：DataView.page / pageSize / total → el-pagination
 * 事件方向：current-change / size-change → DataView.setPage / setPageSize
 */
export function bindPaginationRule(
  rule: BindRule,
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
  rule.field ??= `pagination_${tableName}_${viewId}`

  // 响应式 getter — DataView 是 reactive proxy，每次读取返回最新值（与 bind-form-delegate 对齐）
  rule.props ??= {}
  definePropertyGetter(rule.props, 'currentPage', () => view.page)
  definePropertyGetter(rule.props, 'pageSize', () => view.pageSize)
  definePropertyGetter(rule.props, 'total', () => view.total)

  // 设置合理默认布局（用户配置覆盖）
  rule.props['layout'] ??= 'total, sizes, prev, pager, next'
  rule.props['pageSizes'] ??= [10, 20, 50, 100]

  // ── 注入事件 ──

  wrapEvent(rule, 'currentChange', (page: unknown) => {
    pageLogger.debug(`[PaginationEvent] currentChange`, { tableName, viewId, page })
    void view.setPage(page as number)
  })

  wrapEvent(rule, 'sizeChange', (size: unknown) => {
    pageLogger.debug(`[PaginationEvent] sizeChange`, { tableName, viewId, size })
    void view.setPageSize(size as number)
  })
}
