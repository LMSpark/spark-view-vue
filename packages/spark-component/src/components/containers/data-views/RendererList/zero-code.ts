import type { DataView, DataRow } from '@spark-view/spark-data'
import { createContainerCrudContext } from '../zero-code-shared.js'
import type { RendererListApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

interface RendererListZeroCodeOptions {
  props: Readonly<Record<string, unknown>>
  resolvedView: ValueRef<DataView | null>
  rows: ValueRef<readonly DataRow[]>
}

export function createRendererListZeroCode(options: RendererListZeroCodeOptions) {
  const { props, resolvedView, rows } = options

  const { dispatch, baseMethods } = createContainerCrudContext({
    props,
    resolvedView,
    eventDefaults: {
      'item-click': {
        systemDefault: (row: unknown) => {
          resolvedView.value?.setCurrentRow(row as DataRow)
        },
      },
    },
  })

  const listApi: RendererListApi = {
    ...baseMethods,
    getRows() {
      return rows.value as DataRow[]
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