/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererDetail/zero-code
 * RendererDetail 模块，属于 SPARK component table-level/data-view-container。
 * 组件目录: containers/data-views。
 * 导出 ClassModel symbol: RendererDetailZeroCodeOptions（共 1 个 symbol）。
 */
import type { DataView } from '@spark-appworks/spark-data'
import type { LoggerApi } from '@spark-appworks/spark-utils'
import { createContainerCrudContext } from '../zero-code-shared.js'
import type { RendererDetailApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

/** Renderer Detail Zero Code Options 的调用配置。 */
type RendererDetailZeroCodeOptions = {
    /** 组件属性集合。 */
props: Readonly<Record<string, unknown>>
    /** resolved View 字段。 */
resolvedView: ValueRef<DataView | null>
    /** detail Data 字段。 */
detailData: Record<string, unknown>
    /** 诊断日志接口。 */
logger: LoggerApi}

export function createRendererDetailZeroCode(options: RendererDetailZeroCodeOptions) {
  const { props, resolvedView, detailData } = options

  const { baseMethods } = createContainerCrudContext({
    props,
    resolvedView,
  })

  const detailApi: RendererDetailApi = {
    ...baseMethods,
    getDetailData() {
      return detailData
    },
    getFieldValue(field) {
      return detailData[field]
    },
  }

  return {
    detailApi,
  }
}