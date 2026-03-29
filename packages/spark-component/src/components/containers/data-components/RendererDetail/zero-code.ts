import type { DataView } from '@spark-view/spark-data'
import { createBaseCrudMethods, useEventDefaults } from '../../support/index.js'
import type { RendererDetailApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

interface RendererDetailZeroCodeOptions {
  props: Readonly<Record<string, unknown>>
  resolvedView: ValueRef<DataView | null | undefined>
  detailData: Record<string, unknown>
}

export function createRendererDetailZeroCode(options: RendererDetailZeroCodeOptions) {
  const { dispatch } = useEventDefaults({
    'add-row': {},
    'edit-row': {},
    'remove-row': {},
  }, options.props)

  const baseMethods = createBaseCrudMethods(options.resolvedView, dispatch)

  const detailApi: RendererDetailApi = {
    ...baseMethods,
    getDetailData() {
      return options.detailData
    },
    getFieldValue(field) {
      return options.detailData[field]
    },
  }

  return {
    detailApi,
  }
}