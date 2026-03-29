/**
 * 页面编排层入口。
 *
 * 仅聚合页面渲染、页面数据集生命周期以及页面上下文类型。
 */

export { default as SparkPageRenderer } from './renderer/SparkPageRenderer.vue'
export { usePageDataSet } from './renderer/usePageDataSet.js'

export type {
  UsePageDataSetOptions,
  UsePageDataSetReturn,
} from './renderer/usePageDataSet.js'

export type {
  PageContext,
  PageConfig,
  PageRendererProps,
} from './context/types.js'
