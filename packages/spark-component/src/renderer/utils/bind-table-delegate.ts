/**
 * el-table 规则绑定委托
 *
 * 职责：
 *  - dataKey → DataView 数据属性注入（data / dataSource / dataView）
 *  - UI → DataSet 事件注入（currentChange / selectionChange / sortChange）
 *  - 加载状态指令（v-loading ← DataView.requestState）
 *
 * DataSet → UI 方向由 sync-table-delegate 负责（useRuleBinding 调用）。
 */

import type { BindRule } from '../types'
import type { IDataRow, IDataSet } from '@spark-view/spark-data'
import { parseDataKey, resolveDataKeyBinding, RequestState } from '@spark-view/spark-data'
import { setRuleProp, pageLogger } from './bind-helpers'
import { wrapEvent } from './wrapEvent'

/**
 * 为 el-table 绑定 dataKey → 数据属性 + 事件注入
 *
 * @param rule    当前 el-table 规则节点
 * @param dataSet 页面级 DataSet
 * @param bindingId useRuleBinding 实例标识（originatorId 回路防护）
 */
export function bindTableRule(
  rule: BindRule,
  dataSet: IDataSet | null,
  bindingId?: string
): void {
  const rawKey = rule['dataKey'] as string | undefined
  if (!rawKey) return

  // 数据属性绑定
  const binding = dataSet
    ? resolveDataKeyBinding(rawKey, dataSet)
    : null
  if (binding?.kind === 'view') {
    setRuleProp(rule, 'dataSource', binding.source)
    setRuleProp(rule, 'dataView', binding.source)
    // Element Plus el-table 需要 data 属性（响应式数组）
    setRuleProp(rule, 'data', binding.source.rows)
  }

  // 事件注入
  if (dataSet) {
    injectTableEvents(rule, dataSet, bindingId)
  }
}

// ─── 内部实现 ────────────────────────────────────────────────────────────

/**
 * 为 el-table 注入 DataSet 同步事件（UI → DataSet 方向）
 *
 * 为表格的 currentChange / selectionChange / sortChange 事件注入处理器，
 * 将 el-table UI 事件同步写入对应的 DataView。
 * 事件携带 originatorId，下游 useRuleBinding 仅跳过同一 bindingId 的回写，
 * 其他同级 binding 实例仍正常进行 DataSet→UI 同步。
 */
function injectTableEvents(
  rule: BindRule,
  dataSet: IDataSet,
  bindingId?: string
): void {
  const dk = parseDataKey(rule['dataKey'] as string)
  if (!dk) return

  const { tableName, viewId } = dk
  rule.name ??= `table_${tableName}_${viewId}`
  rule.on ??= {}

  // 提前查找并缓存 view，避免事件处理器各自重复调用 getTable + getOrCreateView
  const table = dataSet.getTable(tableName)
  if (!table) return
  const view = table.getOrCreateView(viewId)

  // ── currentChange（单选行变化）──
  const originalCurrentChange = rule.on['currentChange']
  rule.on['currentChange'] = (currentRow: IDataRow | null, oldRow: IDataRow | null) => {
    pageLogger.debug(`[TableEvent] currentChange`, { tableName, viewId })

    if (typeof originalCurrentChange === 'function') {
      (originalCurrentChange as (...a: unknown[]) => void)(currentRow, oldRow)
    }

    if (currentRow === null) {
      view.selection.setCurrentRowById(null, bindingId)
      return
    }

    // form-create 会污染原始对象（添加 $f/api/rule 属性），直接提取 PK 传给 ID-based API
    const pk = view.getPkKey(currentRow)
    if (pk !== undefined) {
      view.selection.setCurrentRowById(pk, bindingId)
    }
    // pk 缺失 → 静默跳过（行无主键，无法存储）
  }

  // ── selectionChange（多选行变化）──
  wrapEvent(rule, 'selectionChange', (selection: unknown) => {
    const rows = Array.isArray(selection) ? selection as IDataRow[] : []
    pageLogger.debug(`[TableEvent] selectionChange`, { tableName, viewId, count: rows.length })
    // 提取 PK 数组，避免传入被 form-create 污染的行对象
    const ids: Array<string | number> = []
    for (const r of rows) {
      const pk = view.getPkKey(r)
      if (pk !== undefined) ids.push(pk)
    }
    view.selection.setSelectedRowsById(ids, bindingId)
  })

  // ── sortChange（列排序变化 → DataView.setSort）──
  wrapEvent(rule, 'sortChange', (sortInfoRaw: unknown) => {
    const sortInfo = sortInfoRaw as { column: unknown; prop: string | null; order: string | null }
    pageLogger.debug(`[TableEvent] sortChange`, { tableName, viewId, prop: sortInfo.prop, order: sortInfo.order })
    if (!sortInfo.prop || sortInfo.order === null) {
      void view.setSort(undefined)
    } else {
      const direction = sortInfo.order === 'descending' ? 'desc' as const : 'asc' as const
      void view.setSort([{ field: sortInfo.prop, direction }])
    }
  })

  // ── 加载状态指令（v-loading ← DataView.requestState）──
  // BindRule 索引签名允许 directives 属性注入
  rule['directives'] ??= {}
  const loadingDirective = {
    mounted(el: HTMLElement) {
      // 初始加载状态由 el-table 的 v-loading 指令处理
      if (view.requestState === RequestState.Loading) {
        el.setAttribute('loading', 'true')
      }
    },
    updated(el: HTMLElement) {
      if (view.requestState === RequestState.Loading) {
        el.setAttribute('loading', 'true')
      } else {
        el.removeAttribute('loading')
      }
    },
  }
  ;(rule['directives'] as Record<string, unknown>)['loading'] = loadingDirective
}
