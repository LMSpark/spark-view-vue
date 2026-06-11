/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererList/zero-code
 * RendererList 模块，属于 SPARK component table-level/data-view-container。
 * 组件目录: containers/data-views。
 * 导出 ClassModel symbol: RendererListZeroCodeOptions（共 1 个 symbol）。
 */
import { isDataRow, type DataView, type DataRow } from '@spark-appworks/spark-data'
import { createContainerCrudContext } from '../zero-code-shared.js'
import type { RendererListApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

/** Renderer List Zero Code Options 的调用配置。 */
type RendererListZeroCodeOptions = {
    /** 组件属性集合。 */
props: Readonly<Record<string, unknown>>
    /** resolved View 字段。 */
resolvedView: ValueRef<DataView | null>
    /** 行数据集合。 */
rows: ValueRef<readonly DataRow[]>}

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
