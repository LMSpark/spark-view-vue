/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererVirtualCard/types
 * RendererVirtualCard 模块，属于 SPARK component table-level/data-view-container。
 * 组件目录: containers/data-views。
 * 导出 ClassModel symbol: RendererVirtualCardApi（共 1 个 symbol）。
 */
import type { DataRow } from '@spark-appworks/spark-data'
import type { BaseContainerApi } from '../../support/base-container-api.js'

/** Renderer Virtual Card Api 的语义模型。 */
export type RendererVirtualCardApi = BaseContainerApi & {
  getRows(): DataRow[]
  getCachedPages(): number[]
  getPendingPages(): number[]
  getVisiblePages(): number[]
  getCurrentPage(): number
  getTotalPages(): number
  getScrollProgress(): string
  getLoadPolicyText(): string
  getWheelStatusText(): string
  scrollToPage(page: number): Promise<void>
  clearCache(): void
}
