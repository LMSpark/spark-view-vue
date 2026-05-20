import type { DataView, DataRow } from '@spark-view/spark-data'
import { createContainerCrudContext } from '../zero-code-shared.js'
import { isDataRecord } from '../data-row-utils.js'
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
          if (isDataRow(row)) {
            resolvedView.value?.setCurrentRow(row)
          }
        },
      },
    },
  })

  const listApi: RendererListApi = {
    ...baseMethods,
    getRows() {
      return [...rows.value]
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

function isDataRow(value: unknown): value is DataRow {
  return isDataRecord(value)
}
