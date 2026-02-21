/**
 * Rule 绑定 Composable
 */

import { ref, Ref } from 'vue'
import { Logger } from '@spark-view/spark-utils'
import type { IDataSet } from '@spark-view/spark-data'
import { bindDataToRules } from '../utils/bindRules'
import type { Rule } from '../types'

const pageLogger = Logger('PageRenderer')

export interface UseRuleBindingOptions {
  // Note: form-create 的 Rule 类型过于复杂，使用 unknown[] 避免类型冲突
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalRules: Ref<any[]>
  pageData: Record<string, unknown>
  pageFunctions: Ref<Record<string, (...args: unknown[]) => unknown>>
  dataSet: Ref<IDataSet | null>
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
  const { originalRules, pageData, pageFunctions, dataSet } = options
  // Note: form-create 的 Rule 类型过于复杂，使用 unknown[] 避免类型冲突
  const boundRules = ref<unknown[]>([])
  
  const rebindRules = () => {
    if (!originalRules.value || originalRules.value.length === 0) {
      boundRules.value = []
      return
    }
    
    // 重新绑定规则
    // Note: form-create 的 Rule 类型系统过于复杂，且与运行时对象不完全一致。
    // 这里将输入规则断言为 Rule[]，并将输出断言为 unknown[]，避免在业务层扩散 any。
    const newBoundRules = bindDataToRules({
      rules: originalRules.value as unknown as Rule[],
      pageData,
      pageFunctions: pageFunctions.value,
      dataSet: dataSet.value
    }) as unknown[]
    
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
