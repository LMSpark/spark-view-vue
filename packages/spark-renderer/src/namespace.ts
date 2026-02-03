/**
 * SparkRenderer 命名空间 - 统一 API
 */

import PageRenderer from './components/PageRenderer.vue'
import { useCssScope } from './composables/useCssScope'
import { usePageDataSet } from './composables/usePageDataSet'
import { useRuleBinding } from './composables/useRuleBinding'

/**
 * SparkRenderer 命名空间
 */
export const SparkRenderer = {
  /**
   * 组件
   */
  PageRenderer,
  
  /**
   * Composables
   */
  composables: {
    useCssScope,
    usePageDataSet,
    useRuleBinding
  }
}

export default SparkRenderer
