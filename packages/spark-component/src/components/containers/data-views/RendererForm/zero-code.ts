/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererForm/zero-code
 * RendererForm 模块，属于 SPARK component table-level/data-view-container。
 * 组件目录: containers/data-views。
 * 导出 ClassModel symbol: RendererFormZeroCodeOptions（共 1 个 symbol）。
 */
import type { DataView } from '@spark-appworks/spark-data'
import type { LoggerApi } from '@spark-appworks/spark-utils'
import {
  createContainerCrudContext,
  getNativeRefValue,
} from '../zero-code-shared.js'
import type { RendererFormApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

type NativeFormLike = {
  validate?: () => Promise<boolean>
  resetFields?: () => void
  clearValidate?: () => void}

function isNativeFormLike(value: unknown): value is NativeFormLike {
  if (typeof value !== 'object' || value === null) return false
  return (!('validate' in value) || typeof value.validate === 'function')
    && (!('resetFields' in value) || typeof value.resetFields === 'function')
    && (!('clearValidate' in value) || typeof value.clearValidate === 'function')
}

/** Renderer Form Zero Code Options 的调用配置。 */
type RendererFormZeroCodeOptions = {
    /** 组件属性集合。 */
props: Readonly<Record<string, unknown>>
    /** resolved View 字段。 */
resolvedView: ValueRef<DataView | null>
    /** form Model 字段。 */
formModel: Record<string, unknown>
    /** native Form Ref 字段。 */
nativeFormRef: ValueRef<unknown>
    /** 诊断日志接口。 */
logger: LoggerApi}

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
      return getNativeRefValue(nativeFormRef, isNativeFormLike)
    },
    async validate() {
      const form = getNativeRefValue(nativeFormRef, isNativeFormLike)
      if (!form || typeof form.validate !== 'function') return true
      try {
        return await form.validate()
      } catch {
        return false
      }
    },
    resetFields() {
      const form = getNativeRefValue(nativeFormRef, isNativeFormLike)
      if (!form || typeof form.resetFields !== 'function') return
      form.resetFields()
    },
    clearValidate() {
      const form = getNativeRefValue(nativeFormRef, isNativeFormLike)
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
