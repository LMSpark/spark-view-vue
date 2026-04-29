import type { DataView } from '@spark-view/spark-data'
import type { IPageServiceCapability } from '../../../internal'
import type { LoggerApi } from '@spark-view/spark-utils'
import type { SparkNode } from '../../../internal'
import { createBuiltinActionHandler } from '../../support/actions/builtin-action-handler'
import { isBuiltinActionDisabled } from '../../support/actions/builtin-action-disabled'
import { hasRemoteListApi } from '../../support/actions/builtin-action-helpers'
import { createBaseCrudMethods, createCrudDispatcher } from '../../support/index.js'
import type { RendererDetailApi } from './types'
import type { ValueRef } from '../../../shared-types.js'
import type { BuiltinActionScope } from '../../../../page/actions/index.js'

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

  const builtinActionHandler = createBuiltinActionHandler({
    getView: () => options.resolvedView.value,
    getPageService: () => options.pageService,
    getLogger: () => options.logger,
    hasRemoteListApi,
  })

  function isBuiltinActionDisabledAtScope(action: SparkNode, scope?: BuiltinActionScope): boolean {
    return isBuiltinActionDisabled(action, options.resolvedView.value, scope)
  }

  function handleBuiltinToolbarAction(action: SparkNode): void {
    builtinActionHandler.handleToolbar(action)
  }

  return {
    detailApi,
    isBuiltinActionDisabled: isBuiltinActionDisabledAtScope,
    handleBuiltinToolbarAction,
  }
}