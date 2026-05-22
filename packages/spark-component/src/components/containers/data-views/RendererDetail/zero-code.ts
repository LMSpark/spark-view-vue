import type { DataView } from '@spark-view/spark-data'
import type { LoggerApi } from '@spark-view/spark-utils'
import { createContainerCrudContext } from '../zero-code-shared.js'
import type { RendererDetailApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

type RendererDetailZeroCodeOptions = {
  props: Readonly<Record<string, unknown>>
  resolvedView: ValueRef<DataView | null>
  detailData: Record<string, unknown>
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