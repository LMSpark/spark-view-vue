/**
 * @spark-view/spark-renderer
 * 
 * SPARK 页面渲染引擎 - L3 Model Layer
 * 负责将配置化页面渲染为 Vue 组件
 */

// 组件
export { default as PageRenderer } from './components/PageRenderer.vue'

// Composables
export { useCssScope } from './composables/useCssScope'
export { usePageDataSet } from './composables/usePageDataSet'
export { useRuleBinding } from './composables/useRuleBinding'
export { useTableDataSync } from './composables/useTableDataSync'

// 类型导出
export type {
  Rule,
  FormCreateAPI,
  PageContext,
  PageConfig,
  PageRendererOptions,
  RuleBindingOptions
} from './types'
