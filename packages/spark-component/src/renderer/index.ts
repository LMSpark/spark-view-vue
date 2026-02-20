/**
 * SPARK 页面渲染引擎 - 渲染器模块入口
 *
 * 提供纯渲染层能力：
 * - PageRenderer 页面渲染组件
 * - usePageRenderer 页面编排 Composable
 * - 类型定义（Rule、FormCreateAPI、PageContext、PageConfig 等）
 *
 * 内部实现（不导出）：
 * - useCssScope、useRuleBinding、useTableDataSync — 由 usePageRenderer 组合调用
 * - 注意：usePageDataSet 已迁移到 @spark-view/spark-data（数据管理领域）
 */

// 组件（Vue SFC，由此文件统一导出，避免 index.ts 直接引用 .vue 文件）
export { default as PageRenderer } from './PageRenderer.vue'

// 页面编排 Composable（统一入口）
export { usePageRenderer } from './composables/usePageRenderer'
export type { UsePageRendererReturn, UsePageRendererRefs } from './composables/usePageRenderer'

// 类型
export type {
  Rule,
  FormCreateAPI,
  PageContext,
  PageConfig,
  PageRendererOptions,
  RuleBindingOptions
} from './types/index'
