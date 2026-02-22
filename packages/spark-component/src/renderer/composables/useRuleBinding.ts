/**
 * Rule 绑定 + DataSet → el-table UI 同步 Composable
 *
 * 职责：
 *  - 规则绑定：originalRules + pageData/pageFunctions/dataSet → boundRules
 *  - DataSet → UI：rebindRules 后订阅 DataView.stateChanged，驱动 el-table 选中 UI
 *  - UI → DataSet 方向由 bindRules.injectTableEvents 在规则绑定时完成（单向持有）
 */

import { ref, type Ref, onUnmounted } from 'vue'
import { nextTick } from 'vue'
import { Logger } from '@spark-view/spark-utils'
import type { IDataSet, IDataRow } from '@spark-view/spark-data'
import { subscribeViewStateChanges } from '@spark-view/spark-data'
import { bindDataToRules } from '../utils/bindRules'
import type { Rule } from '../types'

const pageLogger = Logger('PageRenderer')

// ─── el-table 命令式接口（Element Plus 原生，无响应式绑定）───────────────────

/** ElementPlus el-table 实例需要命令式驱动选中行，因为它没有 v-model:selection。 */
interface ElTableComponent extends HTMLElement {
  clearSelection?: () => void
  toggleRowSelection?: (row: IDataRow, selected: boolean) => void
  setCurrentRow?: (row: IDataRow | null) => void
}

// 防止 DataSet→UI 同步触发 UI→DataSet 反向同步的标志
let isSyncingToUI = false

/**
 * 将 DataSet 当前行同步到 el-table UI（DataSet → UI 方向）。
 *
 * 通过 formApi.el(`table_{tableName}_{viewId}`) 查找 el-table 实例，
 * 调用其 setCurrentRow 方法更新高亮行。
 * 
 * 注：此函数不再需要设置 isSyncingToUI 标志，
 * 因为事件已带有 source='sync' 标识，由 bindRules 直接检查。
 */
function syncCurrentRowToTable(
  tableName: string,
  viewId: string,
  row: IDataRow | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formApi: any
): void {
  void nextTick(() => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (!formApi || typeof formApi.el !== 'function') return
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const table = formApi.el(`table_${tableName}_${viewId}`) as ElTableComponent | null
    if (!table) return
    
    // ✅ 设置临时标志，防止 setCurrentRow 触发的 currentChange 调用 DataSet API
    // （虽然幂等检查会阻止真正的循环，但此标志可避免不必要的调用）
    isSyncingToUI = true
    try {
      table.setCurrentRow?.(row)
      const rowId = row ? (row as Record<string, unknown>)['id'] : null
      pageLogger.debug('✅ [DataSet→UI] 同步 currentRow 到 el-table', { tableName, viewId, rowId })
    } finally {
      isSyncingToUI = false
    }
  })
}

/**
 * 将 DataSet 选中行同步到 el-table UI（DataSet → UI 方向）。
 *
 * 通过 formApi.el(`table_{tableName}_{viewId}`) 查找 el-table 实例，
 * 调用其命令式 API 更新选中状态。
 * 
 * 注：此函数不再需要设置 isSyncingToUI 标志，
 * 因为事件已带有 source='sync' 标识，由 bindRules 直接检查。
 */
function syncSelectedRowsToTable(
  tableName: string,
  viewId: string,
  rows: IDataRow[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formApi: any
): void {
  void nextTick(() => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (!formApi || typeof formApi.el !== 'function') return
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const table = formApi.el(`table_${tableName}_${viewId}`) as ElTableComponent | null
    if (!table) return
    
    // ✅ 设置临时标志，防止 toggleRowSelection 触发的 selectionChange 调用 DataSet API
    isSyncingToUI = true
    try {
      if (rows.length === 0) {
        table.clearSelection?.()
      } else {
        table.clearSelection?.()
        rows.forEach(row => table.toggleRowSelection?.(row, true))
      }
    } finally {
      isSyncingToUI = false
    }
  })
}

/**
 * 检查当前是否正在执行 DataSet→UI 同步
 * 
 * 用于 bindRules.ts 中过滤由 el-table API 副作用触发的事件。
 */
export function isCurrentlySyncingToUI(): boolean {
  return isSyncingToUI
}

// ─── 公共接口 ─────────────────────────────────────────────────────────────────

export interface UseRuleBindingOptions {
  // Note: form-create 的 Rule 类型过于复杂，使用 unknown[] 避免类型冲突
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalRules: Ref<any[]>
  pageData: Record<string, unknown>
  pageFunctions: Ref<Record<string, (...args: unknown[]) => unknown>>
  dataSet: Ref<IDataSet | null>
  // Note: formApi 使用 any 类型以避免与 form-create 官方复杂类型定义冲突
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formApi: Ref<any>
}

export interface UseRuleBindingReturn {
  // FormCreate Rule 类型系统与 Vue Ref 类型不完全兼容，使用 unknown[] 避免类型断言
  boundRules: Ref<unknown[]>
  rebindRules: () => void
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useRuleBinding(options: UseRuleBindingOptions): UseRuleBindingReturn {
  const { originalRules, pageData, pageFunctions, dataSet, formApi } = options
  const boundRules = ref<unknown[]>([])
  let cleanupSync: (() => void) | null = null

  const rebindRules = () => {
    // 每次重新绑定前清理旧的 DataSet→UI 订阅，防止重复触发
    cleanupSync?.()
    cleanupSync = null

    if (!originalRules.value || originalRules.value.length === 0) {
      boundRules.value = []
      return
    }

    // Note: form-create 的 Rule 类型系统过于复杂，此处使用类型断言
    const newBoundRules = bindDataToRules({
      rules: originalRules.value as unknown as Rule[],
      pageData,
      pageFunctions: pageFunctions.value,
      dataSet: dataSet.value
    }) as unknown[]

    // 创建新数组强制触发响应式更新
    boundRules.value = [...newBoundRules]
    pageLogger.debug('Rules 重新绑定', { rulesCount: originalRules.value.length })

    // injectTableEvents 已在上方 bindDataToRules 中为每个 el-table 创建 DataView；
    // 现在订阅所有视图的 stateChanged，驱动 DataSet → el-table UI 方向。
    if (dataSet.value) {
      // ✅ 记录正在处理的事件 ID（用于循环检测）
      // 使用 Set<number | string> 支持不同类型的 eventId
      const processingEvents = new Set<number | string>()
      
      cleanupSync = subscribeViewStateChanges(
        dataSet.value,
        (tableName, viewId, event) => {
          // ✅ 精确的循环检测：基于唯一 eventId
          if (processingEvents.has(event.context.eventId)) {
            pageLogger.warn('🔄 [防循环] 检测到事件循环，退出', { 
              tableName, 
              viewId, 
              changeType: event.changeType,
              eventId: event.context.eventId,
              source: event.context.source,
              meta: event.context.meta
            })
            return
          }
          
          // 标记为正在处理
          processingEvents.add(event.context.eventId)
          
          // ✅ 优化：UI 触发的事件直接跳过（已是最新状态）
          if (event.context.source === 'ui') {
            pageLogger.debug('⏭️ [防循环] 跳过 UI 触发的事件（已是最新状态）', { 
              tableName, viewId, changeType: event.changeType 
            })
            processingEvents.delete(event.context.eventId)
            return
          }
          
          try {
            if (event.changeType === 'currentRow') {
              syncCurrentRowToTable(tableName, viewId, event.row ?? null, formApi.value)
            } else if (event.changeType === 'selectedRows') {
              syncSelectedRowsToTable(tableName, viewId, event.rows ?? [], formApi.value)
            }
          } finally {
            // ✅ 处理完成后移除标记
            processingEvents.delete(event.context.eventId)
          }
        }
      )
    }
  }

  onUnmounted(() => {
    cleanupSync?.()
    cleanupSync = null
  })

  return { boundRules, rebindRules }
}

