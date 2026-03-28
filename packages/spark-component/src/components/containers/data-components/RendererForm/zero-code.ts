import type { DataView, IDataRow } from '@spark-view/spark-data'
import type { IPageServiceCapability, LoggerApi } from '@spark-view/spark-utils'
import type { SparkNode } from '../../../internal'
import { createBuiltinActionHandler, isBuiltinActionDisabled as _isBuiltinActionDisabled } from '../../builtin-actions'
import { createCancelledCrudResult, useEventDefaults } from '../../support/index.js'
import type { RendererFormApi } from './types'

interface ValueRef<T> {
  value: T
}

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

type AddRowResult = Awaited<ReturnType<DataView['addRow']>>
type EditRowResult = Awaited<ReturnType<DataView['editRowById']>>
type RemoveRowResult = Awaited<ReturnType<DataView['removeRow']>>

export function createRendererFormZeroCode(options: RendererFormZeroCodeOptions) {
  const { dispatch } = useEventDefaults({
    'add-row': {},
    'edit-row': {},
    'remove-row': {},
  }, options.props)

  const formApi: RendererFormApi = {
    getDataSource() {
      return options.resolvedView.value ?? null
    },
    getCurrentRow() {
      return options.resolvedView.value?.currentRow ?? null
    },
    getFormData() {
      return options.formModel
    },
    getNativeForm() {
      return options.nativeFormRef.value
    },
    async refresh() {
      const view = options.resolvedView.value
      if (!view?.dataTable?.api?.list) return
      await view.refresh()
    },
    async addRow(row) {
      const view = options.resolvedView.value
      if (!view) return null
      const { cancel } = await dispatch('add-row', row)
      if (cancel) return createCancelledCrudResult<IDataRow>('addRow cancelled by business handler') as AddRowResult
      const result: AddRowResult = await view.addRow(row)
      return result
    },
    async editRowById(id, patch) {
      const view = options.resolvedView.value
      if (!view) return false
      const { cancel } = await dispatch('edit-row', id, patch)
      if (cancel) return createCancelledCrudResult<IDataRow>('editRowById cancelled by business handler') as EditRowResult
      const result: EditRowResult = await view.editRowById(id, patch)
      return result
    },
    async removeRow(id) {
      const view = options.resolvedView.value
      if (!view) return false
      const { cancel } = await dispatch('remove-row', id)
      if (cancel) return createCancelledCrudResult<boolean>('removeRow cancelled by business handler') as RemoveRowResult
      const result: RemoveRowResult = await view.removeRow(id)
      return result
    },
    appendRow(row) {
      options.resolvedView.value?.appendRow(row)
    },
    updateRowById(id, patch) {
      return options.resolvedView.value?.updateRowById(id, patch) ?? false
    },
    deleteRowById(id) {
      return options.resolvedView.value?.deleteRowById(id) ?? false
    },
    setCurrentRow(row) {
      options.resolvedView.value?.setCurrentRow(row ?? null)
    },
    setCurrentRowById(id) {
      return options.resolvedView.value?.setCurrentRowById(id ?? null) ?? false
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