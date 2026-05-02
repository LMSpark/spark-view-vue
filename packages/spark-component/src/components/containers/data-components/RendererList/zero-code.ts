import type { DataView, IDataRow } from '@spark-view/spark-data'
import { createContainerCrudContext } from '../zero-code-shared.js'
import type { RendererListApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

interface RendererListZeroCodeOptions {
  props: Readonly<Record<string, unknown>>
  resolvedView: ValueRef<DataView | null>
  rows: ValueRef<readonly IDataRow[]>
}

export function createRendererListZeroCode(options: RendererListZeroCodeOptions) {
  const { props, resolvedView, rows } = options

  const { dispatch, baseMethods } = createContainerCrudContext({
    props,
    resolvedView,
    eventDefaults: {
      'item-click': {
        systemDefault: (row: unknown) => {
          resolvedView.value?.setCurrentRow(row as IDataRow)
        },
      },
    },
  })

  const listApi: RendererListApi = {
    ...baseMethods,
    getRows() {
      return rows.value as IDataRow[]
    },
    getItemCount() {
      return rows.value.length
    },
  }

  return {
    dispatch,
    listApi,
  }
}