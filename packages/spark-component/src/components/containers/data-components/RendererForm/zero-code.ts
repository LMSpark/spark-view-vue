import type { DataView } from '@spark-view/spark-data'
import type { IPageServiceCapability } from '../../../internal'
import type { LoggerApi } from '@spark-view/spark-utils'
import type { SparkNode } from '../../../internal'
import { isBuiltinActionDisabled } from '../../support/actions/builtin-action-disabled'
import { createBaseCrudMethods, createCrudDispatcher } from '../../support/index.js'
import type { RendererFormApi } from './types'
import type { ValueRef } from '../../../shared-types.js'
import type { BuiltinActionScope } from '../../../../page/actions/index.js'

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
  const { dispatch } = createCrudDispatcher(options.props)

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

  function isBuiltinActionDisabledAtScope(action: SparkNode, scope?: BuiltinActionScope): boolean {
    return isBuiltinActionDisabled(action, options.resolvedView.value, scope)
  }

  return {
    formApi,
    isBuiltinActionDisabled: isBuiltinActionDisabledAtScope,
  }
}