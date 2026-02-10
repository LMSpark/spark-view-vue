/**
 * Rule 绑定 Composable
 */

import { ref, Ref } from 'vue'
import { Logger } from '@spark-view/spark-utils'
import type { Rule, FormCreateAPI } from '../types'
import type { IDataSet } from '@spark-view/spark-data'
import { bindDataToRules } from '../utils/bindRules'

const pageLogger = Logger('PageRenderer')

export interface UseRuleBindingOptions {
  originalRules: Ref<Rule[]>
  pageData: Record<string, unknown>
  pageFunctions: Ref<Record<string, (...args: unknown[]) => unknown>>
  dataSet: Ref<IDataSet | null>
  formApi: Ref<FormCreateAPI | null>
}

export interface UseRuleBindingReturn {
  // FormCreate Rule 类型系统与 Vue Ref 类型不完全兼容，使用 unknown[] 避免类型断言
  boundRules: Ref<unknown[]>
  rebindRules: () => void
}

/**
 * Rule 数据绑定 Hook
 * 
 * @example
 * ```typescript
 * const { boundRules, rebindRules } = useRuleBinding({
 *   originalRules,
 *   pageData,
 *   pageFunctions,
 *   dataSet,
 *   formApi
 * })
 * 
 * // 数据变化时重新绑定
 * watch(pageData, () => {
 *   rebindRules()
 * })
 * ```
 */
export function useRuleBinding(options: UseRuleBindingOptions): UseRuleBindingReturn {
  const { originalRules, pageData, pageFunctions, dataSet, formApi } = options
  const boundRules = ref<Rule[]>([])
  
  const rebindRules = () => {
    if (!originalRules.value || originalRules.value.length === 0) {
      boundRules.value = []
      return
    }
    
    // 重新绑定规则
    const newBoundRules = bindDataToRules({
      rules: originalRules.value,
      pageData,
      pageFunctions: pageFunctions.value,
      dataSet: dataSet.value,
      formApi: formApi.value
    })
    
    // 🔄 强制触发响应式更新 - 创建新数组而不是直接赋值
    // 这样可以确保 Vue 和 FormCreate 都能检测到变化
    boundRules.value = [...newBoundRules]
    
    pageLogger.debug('Rules 重新绑定', { rulesCount: originalRules.value.length })
  }
  
  return {
    boundRules,
    rebindRules
  }
}
