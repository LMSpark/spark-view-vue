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
}

/**
 * 将 DataSet 选中行同步到 el-table UI（DataSet → UI 方向）。
 *
 * 通过 formApi.el(`table_{tableName}_{viewId}`) 查找 el-table 实例，
 * 调用其命令式 API 更新选中状态。
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
    if (rows.length === 0) {
      table.clearSelection?.()
    } else {
      table.clearSelection?.()
      rows.forEach(row => table.toggleRowSelection?.(row, true))
    }
  })
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
      cleanupSync = subscribeViewStateChanges(
        dataSet.value,
        (tableName, viewId, event) => {
          if (event.changeType === 'selectedRows') {
            syncSelectedRowsToTable(tableName, viewId, event.rows ?? [], formApi.value)
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

