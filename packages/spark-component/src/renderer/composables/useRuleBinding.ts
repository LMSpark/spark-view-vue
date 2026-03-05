/**
 * Rule 绑定 + DataSet → el-table UI 同步 Composable
 *
 * 职责：
 *  - 规则绑定：originalRules + pageFunctions/dataSet → boundRules
 *  - DataSet → UI：rebindRules 后订阅 DataView.stateChanged，驱动 el-table 选中 UI
 *  - UI → DataSet 方向由 bind-table-delegate.injectTableEvents 在规则绑定时完成
 */

import { ref, type Ref, onUnmounted } from 'vue'
import type { IDataSet } from '@spark-view/spark-data'
import { bindDataToRules } from '../utils/bindRules'
import { syncCurrentRowToTable, syncSelectedRowsToTable } from '../utils/sync-table-delegate'
import { pageLogger } from '../utils/bind-helpers'
import type { Rule, FormCreateAPI } from '../types'
import type { ComponentRegistry } from '../../core/types.js'

/** 每次调用 useRuleBinding 生成唯一 instanceId，用于 originatorId 事件回路防护 */
let _bindingIdCounter = 0

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

    // bind-table-delegate 已在上方 bindDataToRules 中为每个 el-table 注入 UI→DataSet 事件；
    // 现在订阅所有视图的独立事件，驱动 DataSet → el-table UI 方向。
    const currentDataSet = options.dataSet
    if (currentDataSet) {
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

