/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererList/types
 * RendererList 模块，属于 SPARK component table-level/data-view-container。
 * 组件目录: containers/data-views。
 * 导出 ClassModel symbol: RendererListApi（共 1 个 symbol）。
 */
import type { DataRow } from '@spark-appworks/spark-data'
import type { BaseContainerApi } from '../../support/base-container-api.js'

/** Renderer List Api 的语义模型。 */
export type RendererListApi = BaseContainerApi & {
  getRows(): DataRow[]
    getItemCount(): number}
