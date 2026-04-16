import type { DataView, IDataRow } from '@spark-view/spark-data'
import type { IPageServiceCapability } from '../../../internal'
import type { LoggerApi } from '@spark-view/spark-utils'
import type { SparkNode } from '../../../internal'
import { createBuiltinActionHandler } from './builtin-action-handler'
import { isBuiltinActionDisabled } from './builtin-action-disabled'
import { hasRemoteListApi } from './builtin-action-helpers'
import type { BuiltinActionScope } from './builtin-action-meta'

interface BuiltinActionBridgeOptions {
  getView: () => DataView | null | undefined
  getPageService: () => IPageServiceCapability | null | undefined
  getLogger: () => LoggerApi
  getFormApi?: () => {
    getCurrentRow(): IDataRow | null
    getFormData(): Record<string, unknown>
    validate?(): Promise<boolean>
  } | null | undefined
}

export function createBuiltinActionBridge(options: BuiltinActionBridgeOptions) {
  const handler = createBuiltinActionHandler({
    getView: options.getView,
    getPageService: options.getPageService,
    getLogger: options.getLogger,
    hasRemoteListApi,
    ...(options.getFormApi !== undefined ? { getFormApi: options.getFormApi } : {}),
  })

  function isDisabled(action: SparkNode, scope?: BuiltinActionScope): boolean {
    return isBuiltinActionDisabled(action, options.getView(), scope)
  }

  return {
    isDisabled,
    handleToolbar(action: SparkNode): void {
      handler.handleToolbar(action)
    },
    handleRow(action: SparkNode, row: IDataRow, index: number): void {
      handler.handleRow(action, row, index)
    },
  }
}
