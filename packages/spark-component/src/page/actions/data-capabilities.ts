/**
 * 动作执行的数据能力解析：从 dataKey + DataSet 解析出 DataView / currentRow / selectedRows。
 */

import type { DataView, IDataRow } from '@spark-view/spark-data'
import { getViewFromRawKey, resolveDataKeyBinding } from '@spark-view/spark-data'
import type { ActionExecutionContext } from './action-descriptor'
import { getSelectedRows, isRowLike } from './executor-helpers'

export interface ResolvedActionDataCapabilities {
  dataSource: DataView | null
  currentRow: IDataRow | null
  selectedRows: IDataRow[]
}

/**
 * 解析数据能力：
 * - 提供 dataKey：按绑定解析
 * - 无 dataKey：回退到 DataSet 中第一个表的 default 视图
 */
export function resolveActionDataCapabilities(
  dataKey: string | undefined,
  ctx: ActionExecutionContext,
): ResolvedActionDataCapabilities {
  const empty: ResolvedActionDataCapabilities = { dataSource: null, currentRow: null, selectedRows: [] }
  const ds = ctx.getDataSet()
  if (!ds) return empty

  if (dataKey) {
    const binding = resolveDataKeyBinding(dataKey, ds)
    if (!binding) return empty

    if (binding.kind === 'view') {
      const dataSource = binding.source as DataView
      return {
        dataSource,
        currentRow: isRowLike(dataSource.currentRow) ? dataSource.currentRow : null,
        selectedRows: getSelectedRows(dataSource),
      }
    }

    const dataSource = getViewFromRawKey(dataKey, ds) ?? null
    return {
      dataSource,
      currentRow: isRowLike(binding.value)
        ? binding.value
        : (dataSource && isRowLike(dataSource.currentRow) ? dataSource.currentRow : null),
      selectedRows: dataSource ? getSelectedRows(dataSource) : [],
    }
  }

  for (const tableName of Object.keys(ds.tables)) {
    const dataSource = ds.getView(tableName, 'default')
    if (!dataSource) continue
    return {
      dataSource,
      currentRow: isRowLike(dataSource.currentRow) ? dataSource.currentRow : null,
      selectedRows: getSelectedRows(dataSource),
    }
  }

  return empty
}
