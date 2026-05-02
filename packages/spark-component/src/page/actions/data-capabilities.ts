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
 * - 仅当提供 dataKey 时按绑定解析
 * - 未提供 dataKey 时返回空能力（fail-fast，禁止隐式猜测视图）
 */
export function resolveActionDataCapabilities(
  dataKey: string | undefined,
  ctx: ActionExecutionContext,
): ResolvedActionDataCapabilities {
  const empty: ResolvedActionDataCapabilities = { dataSource: null, currentRow: null, selectedRows: [] }
  const ds = ctx.getDataSet()
  if (!ds || !dataKey) return empty

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
