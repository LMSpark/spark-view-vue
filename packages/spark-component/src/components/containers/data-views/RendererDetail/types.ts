import type { BaseContainerApi } from '../../support/base-container-api.js'

export interface RendererDetailApi extends BaseContainerApi {
  getDetailData(): Record<string, unknown>
    getFieldValue(field: string): unknown
}
