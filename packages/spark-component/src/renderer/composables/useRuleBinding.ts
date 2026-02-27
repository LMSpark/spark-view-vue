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
import { bindDataToRules } from '../utils/bindRules'
import type { Rule } from '../types'
import type { ComponentRegistry } from '../../core/types.js'

const pageLogger = Logger('PageRenderer')

/** 每次调用 useRuleBinding 生成唯一 instanceId，用于 originatorId 事件回路防护 */
let _bindingIdCounter = 0

// ─── el-table 命令式接口（Element Plus 原生，无响应式绑定）───────────────────

/** ElementPlus el-table 实例需要命令式驱动选中行，因为它没有 v-model:selection。 */
interface ElTableComponent extends HTMLElement {
  clearSelection?: () => void
  toggleRowSelection?: (row: IDataRow, selected: boolean) => void
  setCurrentRow?: (row: IDataRow | null) => void
}

// 旧的同步标志已废弃；事件上下文带有 source='sync' 便可防止循环

/**
 * 通过 formApi 查找指定表格的 el-table 实例（命令式 API 共享入口）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTableEl(tableName: string, viewId: string, formApi: any): ElTableComponent | null {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (!formApi || typeof formApi.el !== 'function') return null
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  return formApi.el(`table_${tableName}_${viewId}`) as ElTableComponent | null
}

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
    const table = getTableEl(tableName, viewId, formApi)
    if (!table) return
    
    // 直接同步，无需任何临时标志
    table.setCurrentRow?.(row)
    const rowId = row ? (row as Record<string, unknown>)['id'] : null
    pageLogger.debug('✅ [DataSet→UI] 同步 currentRow 到 el-table', { tableName, viewId, rowId })
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
    const table = getTableEl(tableName, viewId, formApi)
    if (!table) return
    
    // 直接同步选中状态到表格
    if (rows.length === 0) {
      table.clearSelection?.()
    } else {
      table.clearSelection?.()
      for (const row of rows) table.toggleRowSelection?.(row, true)
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
  /** 组件注册表（可选）——用于 dataKey 行为查询，替代硬编码的内置组件白名单 */
  registry?: ComponentRegistry
}

export interface UseRuleBindingReturn {
  // FormCreate Rule 类型系统与 Vue Ref 类型不完全兼容，使用 unknown[] 避免类型断言
  boundRules: Ref<unknown[]>
  rebindRules: () => void
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useRuleBinding(options: UseRuleBindingOptions): UseRuleBindingReturn {
  const { originalRules, pageData, pageFunctions, dataSet, formApi, registry } = options
  const instanceId = `binding-${++_bindingIdCounter}`
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
      dataSet: dataSet.value,
      bindingId: instanceId,
      ...(registry !== undefined ? { registry } : {})
    }) as unknown[]

    // 创建新数组强制触发响应式更新
    boundRules.value = [...newBoundRules]
    pageLogger.debug('Rules 重新绑定', { rulesCount: originalRules.value.length })

    // injectTableEvents 已在上方 bindDataToRules 中为每个 el-table 创建 DataView；
    // 现在订阅所有视图的 stateChanged，驱动 DataSet → el-table UI 方向。
    if (dataSet.value) {
      // 订阅此 DataSet 内所有视图的状态变化，驱动 el-table UI 同步（DataSet → UI 方向）
      // source='ui' 表示事件源自 UI 操作，无需反向同步回 UI（防止死循环）
      cleanupSync = dataSet.value.onAnyViewChange((evt) => {
        // 跳过由本实例自身发起的事件（无论 source 类型），避免 UI→DataSet→UI 回环
        if (evt.originatorId === instanceId) return
        if (evt.changeType === 'currentRow') {
          syncCurrentRowToTable(evt.tableName, evt.viewId, evt.row ?? null, formApi.value)
        } else if (evt.changeType === 'selectedRows') {
          syncSelectedRowsToTable(evt.tableName, evt.viewId, evt.rows ?? [], formApi.value)
        } else if (evt.changeType === 'cleared') {
          syncCurrentRowToTable(evt.tableName, evt.viewId, null, formApi.value)
          syncSelectedRowsToTable(evt.tableName, evt.viewId, [], formApi.value)
        }
      })
    }
  }

  onUnmounted(() => {
    cleanupSync?.()
    cleanupSync = null
  })

  return { boundRules, rebindRules }
}

