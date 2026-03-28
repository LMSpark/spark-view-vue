import type { DataView, IDataRow } from '@spark-view/spark-data'
import { createCancelledCrudResult, useEventDefaults } from '../../support/index.js'
import type { RendererListApi } from './types'

interface ValueRef<T> {
  value: T
}

interface RendererListZeroCodeOptions {
  props: Readonly<Record<string, unknown>>
  resolvedView: ValueRef<DataView | null | undefined>
  listRows: ValueRef<IDataRow[]>
}

type AddRowResult = Awaited<ReturnType<DataView['addRow']>>
type EditRowResult = Awaited<ReturnType<DataView['editRowById']>>
type RemoveRowResult = Awaited<ReturnType<DataView['removeRow']>>

export function createRendererListZeroCode(options: RendererListZeroCodeOptions) {
  const { dispatch } = useEventDefaults({
    'item-click': {
      systemDefault: (row: unknown) => {
        options.resolvedView.value?.setCurrentRow(row as IDataRow)
      },
    },
    'add-row': {},
    'edit-row': {},
    'remove-row': {},
  }, options.props)

  const listApi: RendererListApi = {
    getDataSource() {
      return options.resolvedView.value ?? null
    },
    getRows() {
      return options.listRows.value
    },
    getCurrentRow() {
      return options.resolvedView.value?.currentRow ?? null
    },
    getItemCount() {
      return options.listRows.value.length
    },
    async refresh() {
      const view = options.resolvedView.value
      if (view?.dataTable?.api?.list === undefined) return
      await view.refresh()
    },
    async addRow(row) {
      const view = options.resolvedView.value
      if (view === null || view === undefined) return null
      const { cancel } = await dispatch('add-row', row)
      if (cancel) return createCancelledCrudResult<IDataRow>('addRow cancelled by business handler') as AddRowResult
      return await view.addRow(row)
    },
    async editRowById(id, patch) {
      const view = options.resolvedView.value
      if (view === null || view === undefined) return false
      const { cancel } = await dispatch('edit-row', id, patch)
      if (cancel) return createCancelledCrudResult<IDataRow>('editRowById cancelled by business handler') as EditRowResult
      return await view.editRowById(id, patch)
    },
    async removeRow(id) {
      const view = options.resolvedView.value
      if (view === null || view === undefined) return false
      const { cancel } = await dispatch('remove-row', id)
      if (cancel) return createCancelledCrudResult<boolean>('removeRow cancelled by business handler') as RemoveRowResult
      return await view.removeRow(id)
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
  }

  return {
    dispatch,
    listApi,
  }
}