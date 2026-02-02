/**
 * SparkRenderer 命名空间 - 统一 API
 */

import PageRenderer from './components/PageRenderer.vue'
import { useCssScope } from './composables/useCssScope'
import { useScriptSandbox } from './composables/useScriptSandbox'
import { usePageDataSet } from './composables/usePageDataSet'
import { useRuleBinding } from './composables/useRuleBinding'
import { scopeCSS } from './utils/scopeCSS'
import { loadScriptModule } from './utils/createSandbox'
import { bindDataToRules } from './utils/bindRules'

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
    useScriptSandbox,
    usePageDataSet,
    useRuleBinding
  },
  
  /**
   * 工具函数
   */
  utils: {
    scopeCSS,
    loadScriptModule,
    bindDataToRules
  }
}

export default SparkRenderer
