/**
 * SPARK 页面渲染引擎 - 渲染器模块入口
 * 
 * 从 spark-renderer 包整合而来，提供：
 * - PageRenderer 页面渲染组件
 * - 相关 Composables（useCssScope、usePageDataSet、useRuleBinding、useTableDataSync）
 * - 类型定义（Rule、FormCreateAPI、PageContext、PageConfig 等）
 */

// 组件（Vue SFC，由此文件统一导出，避免 index.ts 直接引用 .vue 文件）
export { default as PageRenderer } from './PageRenderer.vue'

// Composables
export { useCssScope } from './composables/useCssScope'
export { usePageDataSet } from './composables/usePageDataSet'
export { useRuleBinding } from './composables/useRuleBinding'
export { useTableDataSync } from './composables/useTableDataSync'

// 类型
export type {
  Rule,
  FormCreateAPI,
  PageContext,
  PageConfig,
  PageRendererOptions,
  RuleBindingOptions
} from './types/index'
