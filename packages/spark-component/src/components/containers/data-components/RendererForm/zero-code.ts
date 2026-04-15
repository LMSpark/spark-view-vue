import type { DataView } from '@spark-view/spark-data'
import type { IPageServiceCapability, LoggerApi } from '@spark-view/spark-utils'
import type { SparkNode } from '../../../internal'
import { createBuiltinActionHandler } from '../../builtin-action-handler'
import { isBuiltinActionDisabled as _isBuiltinActionDisabled } from '../../builtin-action-disabled'
import { createBaseCrudMethods, createCrudEventDefaults, useEventDefaults } from '../../support/index.js'
import type { RendererFormApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

interface NativeFormLike {
  validate?: () => Promise<boolean>
  resetFields?: () => void
  clearValidate?: () => void
}

interface RendererFormZeroCodeOptions {
  props: Readonly<Record<string, unknown>>
  resolvedView: ValueRef<DataView | null | undefined>
  formModel: Record<string, unknown>
  nativeFormRef: ValueRef<unknown>
  pageService: IPageServiceCapability | null | undefined
  logger: LoggerApi
}

export function createRendererFormZeroCode(options: RendererFormZeroCodeOptions) {
  const { dispatch } = useEventDefaults(createCrudEventDefaults(), options.props)

  const baseMethods = createBaseCrudMethods(options.resolvedView, dispatch)

  const formApi: RendererFormApi = {
    ...baseMethods,
    getFormData() {
      return options.formModel
    },
    getNativeForm() {
      return options.nativeFormRef.value
    },
    async validate() {
      const form = options.nativeFormRef.value as NativeFormLike | null
      if (!form || typeof form.validate !== 'function') return true
      try {
        return await form.validate()
      } catch {
        return false
      }
    },
    resetFields() {
      const form = options.nativeFormRef.value as NativeFormLike | null
      if (!form || typeof form.resetFields !== 'function') return
      form.resetFields()
    },
    clearValidate() {
      const form = options.nativeFormRef.value as NativeFormLike | null
      if (!form || typeof form.clearValidate !== 'function') return
      form.clearValidate()
    },
    getFieldValue(field) {
      return options.formModel[field]
    },
    setFieldValue(field, value) {
      options.formModel[field] = value
    },
  }

  const builtinHandler = createBuiltinActionHandler({
    getView: () => options.resolvedView.value,
    getPageService: () => options.pageService,
    getLogger: () => options.logger,
    hasRemoteListApi: view => Boolean(view.dataTable?.api?.list),
    getFormApi: () => formApi,
  })

  function isBuiltinActionDisabled(action: SparkNode): boolean {
    return _isBuiltinActionDisabled(action, options.resolvedView.value)
  }

  function handleBuiltinToolbarAction(action: SparkNode): void {
    builtinHandler.handleToolbar(action)
  }

  return {
    formApi,
    isBuiltinActionDisabled,
    handleBuiltinToolbarAction,
  }
}