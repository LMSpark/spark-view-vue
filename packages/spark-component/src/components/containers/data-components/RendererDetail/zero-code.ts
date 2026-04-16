import type { DataView } from '@spark-view/spark-data'
import type { IPageServiceCapability } from '../../../internal'
import type { LoggerApi } from '@spark-view/spark-utils'
import type { SparkNode } from '../../../internal'
import { createBuiltinActionBridge } from '../../support/actions/builtin-action-bridge'
import { createBaseCrudMethods, createCrudDispatcher } from '../../support/index.js'
import type { RendererDetailApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

interface RendererDetailZeroCodeOptions {
  props: Readonly<Record<string, unknown>>
  resolvedView: ValueRef<DataView | null | undefined>
  detailData: Record<string, unknown>
  pageService: IPageServiceCapability | null | undefined
  logger: LoggerApi
}

export function createRendererDetailZeroCode(options: RendererDetailZeroCodeOptions) {
  const { dispatch } = createCrudDispatcher(options.props)

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

  const builtinActions = createBuiltinActionBridge({
    getView: () => options.resolvedView.value,
    getPageService: () => options.pageService,
    getLogger: () => options.logger,
  })

  function isBuiltinActionDisabled(action: SparkNode): boolean {
    return builtinActions.isDisabled(action)
  }

  function handleBuiltinToolbarAction(action: SparkNode): void {
    builtinActions.handleToolbar(action)
  }

  return {
    detailApi,
    isBuiltinActionDisabled,
    handleBuiltinToolbarAction,
  }
}