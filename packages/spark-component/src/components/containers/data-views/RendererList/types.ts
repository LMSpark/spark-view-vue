import type { DataRow } from '@spark-view/spark-data'
import type { BaseContainerApi } from '../../support/base-container-api.js'

export interface RendererListApi extends BaseContainerApi {
  getRows(): DataRow[]
    getItemCount(): number
}
