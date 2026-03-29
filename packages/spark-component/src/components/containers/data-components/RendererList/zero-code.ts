import type { DataView, IDataRow } from '@spark-view/spark-data'
import { createBaseCrudMethods, useEventDefaults } from '../../support/index.js'
import type { RendererListApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

interface RendererListZeroCodeOptions {
  props: Readonly<Record<string, unknown>>
  resolvedView: ValueRef<DataView | null | undefined>
  listRows: ValueRef<IDataRow[]>
}

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

  const baseMethods = createBaseCrudMethods(options.resolvedView, dispatch)

  const listApi: RendererListApi = {
    ...baseMethods,
    getRows() {
      return options.listRows.value
    },
    getItemCount() {
      return options.listRows.value.length
    },
  }

  return {
    dispatch,
    listApi,
  }
}