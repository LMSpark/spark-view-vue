import type { DataRow } from '@spark-appworks/spark-data'
import type { BaseContainerApi } from '../../support/base-container-api.js'

export type RendererVirtualCardApi = BaseContainerApi & {
  getRows(): DataRow[]
  getCachedPages(): number[]
  getCurrentPage(): number
  scrollToPage(page: number): Promise<void>
  clearCache(): void
}
