import { getViewFromRawKey } from '@spark-view/spark-data'
import type { DataView, IDataSet } from '@spark-view/spark-data'

/**
 * spark-component 渲染层统一 DataKey → DataView 入口。
 *
 * - 空 key / 缺少 DataSet → null
 * - 非法 key / 视图不存在 → null
 */
export function resolveViewFromDataKey(
  rawKey: string | undefined,
  dataSet: IDataSet | null | undefined,
): DataView | null {
  if (!rawKey || !dataSet) return null
  return getViewFromRawKey(rawKey, dataSet) ?? null
}