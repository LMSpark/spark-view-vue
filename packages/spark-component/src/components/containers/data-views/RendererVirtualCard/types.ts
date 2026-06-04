import type { DataRow } from '@spark-appworks/spark-data'
import type { BaseContainerApi } from '../../support/base-container-api.js'

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
