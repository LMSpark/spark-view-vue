/**
 * SPARK 页面渲染引擎 - 渲染器模块入口
 *
 * 提供纯渲染层能力：
 * - PageRenderer 页面渲染组件（基于 FormCreate）
 * - JsonRenderer JSON 配置渲染组件（通用配置驱动）
 * - usePageRenderer 页面编排 Composable
 * - useJsonRenderer JSON 渲染 Composable
 * - 类型定义（Rule、FormCreateAPI、PageContext、PageConfig 等）
 *
 * 内部实现（不导出）：
 * - useCssScope、useRuleBinding — 由 usePageRenderer 组合调用
 */

// 组件（Vue SFC，由此文件统一导出，避免 index.ts 直接引用 .vue 文件）
// fc/ — FormCreate 技术路线：规则引擎驱动的页面渲染
export { default as FCPageRenderer } from './fc/FCPageRenderer.vue'

// spark/ — SPARK 原生技术路线
// SparkPageRenderer: 页面级入口（远程加载 JSON + 状态管理）
// SparkComponentRenderer: 递归组件引擎（被 SparkPageRenderer 及业务组件调用）
export { default as SparkPageRenderer } from './spark/SparkPageRenderer.vue'
export { default as SparkComponentRenderer } from './spark/SparkComponentRenderer.vue'

// 页面编排 Composable（统一入口）
export { usePageRenderer } from './composables/usePageRenderer'
export type { UsePageRendererReturn, UsePageRendererRefs } from './composables/usePageRenderer'

// DataSet 初始化 Composable（迁移自 spark-data）
export { usePageDataSet } from './composables/usePageDataSet'
export type { UsePageDataSetOptions, UsePageDataSetReturn } from './composables/usePageDataSet'

// JSON 渲染 Composable
export { useJsonRenderer } from './composables/useJsonRenderer'
export type { UseJsonRendererReturn } from './composables/useJsonRenderer'

// 类型
export type {
  Rule,
  FormCreateAPI,
  PageContext,
  PageConfig,
  PageRendererOptions,
  RuleBindingOptions,
  JsonRendererOptions
} from './types/index'
