import type { BaseContainerApi } from '../../support/base-container-api.js'

export type RendererDetailApi = BaseContainerApi & {
  getDetailData(): Record<string, unknown>
  getFieldValue(field: string): unknown
}
