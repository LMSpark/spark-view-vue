import type { DataView } from '@spark-view/spark-data'
import type { IPageServiceCapability, LoggerApi } from '@spark-view/spark-utils'
import type { SparkNode } from '../../../internal'
import { createBuiltinActionHandler } from '../../builtin-action-handler'
import { isBuiltinActionDisabled as _isBuiltinActionDisabled } from '../../builtin-action-disabled'
import { createBaseCrudMethods, createCrudEventDefaults, useEventDefaults } from '../../support/index.js'
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
  const { dispatch } = useEventDefaults(createCrudEventDefaults(), options.props)

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

  const builtinHandler = createBuiltinActionHandler({
    getView: () => options.resolvedView.value,
    getPageService: () => options.pageService,
    getLogger: () => options.logger,
    hasRemoteListApi: view => Boolean(view.dataTable?.api?.list),
  })

  function isBuiltinActionDisabled(action: SparkNode): boolean {
    return _isBuiltinActionDisabled(action, options.resolvedView.value)
  }

  function handleBuiltinToolbarAction(action: SparkNode): void {
    builtinHandler.handleToolbar(action)
  }

  return {
    detailApi,
    isBuiltinActionDisabled,
    handleBuiltinToolbarAction,
  }
}