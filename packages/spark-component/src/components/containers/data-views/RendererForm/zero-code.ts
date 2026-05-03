import type { DataView } from '@spark-view/spark-data'
import type { LoggerApi } from '@spark-view/spark-utils'
import {
  createContainerCrudContext,
  getNativeRefValue,
} from '../zero-code-shared.js'
import type { RendererFormApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

interface NativeFormLike {
  validate?: () => Promise<boolean>
  resetFields?: () => void
  clearValidate?: () => void
}

interface RendererFormZeroCodeOptions {
  props: Readonly<Record<string, unknown>>
  resolvedView: ValueRef<DataView | null>
  formModel: Record<string, unknown>
  nativeFormRef: ValueRef<unknown>
  logger: LoggerApi
}

export function createRendererFormZeroCode(options: RendererFormZeroCodeOptions) {
  const { props, resolvedView, formModel, nativeFormRef } = options

  const { baseMethods } = createContainerCrudContext({
    props,
    resolvedView,
  })

  const formApi: RendererFormApi = {
    ...baseMethods,
    getFormData() {
      return formModel
    },
    getNativeForm() {
      return getNativeRefValue<NativeFormLike>(nativeFormRef)
    },
    async validate() {
      const form = getNativeRefValue<NativeFormLike>(nativeFormRef)
      if (!form || typeof form.validate !== 'function') return true
      try {
        return await form.validate()
      } catch {
        return false
      }
    },
    resetFields() {
      const form = getNativeRefValue<NativeFormLike>(nativeFormRef)
      if (!form || typeof form.resetFields !== 'function') return
      form.resetFields()
    },
    clearValidate() {
      const form = getNativeRefValue<NativeFormLike>(nativeFormRef)
      if (!form || typeof form.clearValidate !== 'function') return
      form.clearValidate()
    },
    getFieldValue(field) {
      return formModel[field]
    },
    setFieldValue(field, value) {
      formModel[field] = value
    },
  }

  return {
    formApi,
  }
}