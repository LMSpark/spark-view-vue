import type { DataView, IDataRow } from '@spark-view/spark-data'
import { createBaseCrudMethods, createCrudDispatcher } from '../../support/index.js'
import type { RendererListApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

interface RendererListZeroCodeOptions {
  props: Readonly<Record<string, unknown>>
  resolvedView: ValueRef<DataView | null | undefined>
  listRows: ValueRef<IDataRow[]>
}

export function createRendererListZeroCode(options: RendererListZeroCodeOptions) {
  const { dispatch } = createCrudDispatcher(options.props, {
    'item-click': {
      systemDefault: (row: unknown) => {
        options.resolvedView.value?.setCurrentRow(row as IDataRow)
      },
    },
  })

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