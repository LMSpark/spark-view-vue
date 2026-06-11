/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererDetail/types
 * RendererDetail 模块，属于 SPARK component table-level/data-view-container。
 * 组件目录: containers/data-views。
 * 导出 ClassModel symbol: RendererDetailApi（共 1 个 symbol）。
 */
import type { BaseContainerApi } from '../../support/base-container-api.js'

/** Renderer Detail Api 的语义模型。 */
export type RendererDetailApi = BaseContainerApi & {
  getDetailData(): Record<string, unknown>
    getFieldValue(field: string): unknown}
