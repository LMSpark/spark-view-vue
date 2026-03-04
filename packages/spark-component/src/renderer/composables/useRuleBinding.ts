/**
 * Rule 绑定 + DataSet → el-table UI 同步 Composable
 *
 * 职责：
 *  - 规则绑定：originalRules + pageFunctions/dataSet → boundRules
 *  - DataSet → UI：rebindRules 后订阅 DataView.stateChanged，驱动 el-table 选中 UI
 *  - UI → DataSet 方向由 bindRules.injectTableEvents 在规则绑定时完成（单向持有）
 */

import { ref, type Ref, onUnmounted } from 'vue'
import { nextTick } from 'vue'
import { Logger } from '@spark-view/spark-utils'
import type { IDataSet, IDataRow } from '@spark-view/spark-data'
import { bindDataToRules } from '../utils/bindRules'
import type { Rule, FormCreateAPI } from '../types'
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
function getTableEl(tableName: string, viewId: string, formApi: FormCreateAPI | null): ElTableComponent | null {
  if (!formApi || typeof formApi.el !== 'function') return null
  const el = formApi.el(`table_${tableName}_${viewId}`) as ElTableComponent | null
  // duck-typing 守卒：确保返回的组件实例确实具有 el-table 命令式 API
  return el && typeof el.setCurrentRow === 'function' ? el : null
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
  formApi: FormCreateAPI | null
): void {
  nextTick(() => {
    const table = getTableEl(tableName, viewId, formApi)
    if (!table) return
    
    // 直接同步，无需任何临时标志
    table.setCurrentRow?.(row)
    pageLogger.debug('✅ [DataSet→UI] 同步 currentRow 到 el-table', { tableName, viewId, hasRow: !!row })
  }).catch(() => { /* nextTick 内部回调异常安全 */ })
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
  formApi: FormCreateAPI | null
): void {
  nextTick(() => {
    const table = getTableEl(tableName, viewId, formApi)
    if (!table) return
    
    // 直接同步选中状态到表格
    if (rows.length === 0) {
      table.clearSelection?.()
    } else {
      table.clearSelection?.()
      for (const row of rows) table.toggleRowSelection?.(row, true)
    }
  }).catch(() => { /* nextTick 内部回调异常安全 */ })
}


// ─── 公共接口 ─────────────────────────────────────────────────────────────────

export interface UseRuleBindingOptions {
  /** form-create 规则（JSON 解析后的未类型化数据，传入 bindDataToRules 时转为 Rule[]） */
  originalRules: Ref<unknown[]>
  pageFunctions: Ref<Record<string, (...args: unknown[]) => unknown>>
  dataSet: IDataSet | null
  formApi: Ref<FormCreateAPI | null>
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
  const { originalRules, pageFunctions, formApi, registry } = options
  const instanceId = `binding-${++_bindingIdCounter}`
  const boundRules = ref<unknown[]>([])
  let cleanupSync: (() => void) | null = null

  const rebindRules = () => {
    // 每次重新绑定前清理旧的 DataSet→UI 订阅，防止重复触发
    cleanupSync?.()
    cleanupSync = null

    if (originalRules.value.length === 0) {
      boundRules.value = []
      return
    }

    const newBoundRules = bindDataToRules({
      rules: originalRules.value as Rule[],
      pageFunctions: pageFunctions.value,
      dataSet: options.dataSet,
      bindingId: instanceId,
      ...(registry !== undefined ? { registry } : {})
    })

    // 创建新数组强制触发响应式更新
    boundRules.value = [...newBoundRules]
    pageLogger.debug('Rules 重新绑定', { rulesCount: originalRules.value.length })

    // injectTableEvents 已在上方 bindDataToRules 中为每个 el-table 创建 DataView；
    // 现在订阅所有视图的独立事件，驱动 DataSet → el-table UI 方向。
    const currentDataSet = options.dataSet
    if (currentDataSet) {
      // 订阅此 DataSet 内所有视图的状态变化，驱动 el-table UI 同步（DataSet → UI 方向）
      cleanupSync = currentDataSet.onAnyViewChange({
        currentRowChanged(tableName, viewId, currentRow, originatorId) {
          if (originatorId === instanceId) return
          if (currentRow === null) {
            syncCurrentRowToTable(tableName, viewId, null, formApi.value)
            return
          }
          // DataView.wrapInstance 使用 Vue reactive() 包装；el-table 的 :data 里存的是 reactive proxy。
          // el-table.setCurrentRow() 用 === 比较，直接传原始对象（raw row）会找不到行，背景不变色。
          // 通过 reactive DataView 的 rows 数组查找同 PK 的 reactive proxy 版本再传入。
          const view = currentDataSet.getTable(tableName)?.getView(viewId)
          if (view) {
            const pk = view.getPkKey(currentRow)
            const reactiveRow = pk !== undefined
              ? view.rows.find(r => view.getPkKey(r) === pk) ?? currentRow
              : currentRow
            syncCurrentRowToTable(tableName, viewId, reactiveRow, formApi.value)
          } else {
            syncCurrentRowToTable(tableName, viewId, currentRow, formApi.value)
          }
        },
        selectedRowsChanged(tableName, viewId, selectedRows, originatorId) {
          if (originatorId === instanceId) return
          syncSelectedRowsToTable(tableName, viewId, selectedRows, formApi.value)
        },
        cleared(tableName, viewId) {
          syncCurrentRowToTable(tableName, viewId, null, formApi.value)
          syncSelectedRowsToTable(tableName, viewId, [], formApi.value)
        },
      })
    }
  }

  onUnmounted(() => {
    cleanupSync?.()
    cleanupSync = null
  })

  return { boundRules, rebindRules }
}

