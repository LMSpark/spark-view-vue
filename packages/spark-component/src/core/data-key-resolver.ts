import { getViewFromRawKey, resolveDataKeyBinding } from '@spark-view/spark-data'
import type { DataView, IDataRow, IDataSet } from '@spark-view/spark-data'

export interface ResolvedDataCapabilities {
  dataSource: DataView | null
  dataRow: IDataRow | null
}

function isRowLike(value: unknown): value is IDataRow {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
}

/**
 * spark-component 渲染层统一 DataKey 能力解析入口。
 *
 * - dataSource：优先返回绑定到的 DataView（rows 或 value 字段均可定位到所属 view）
 * - dataRow：field 指向行对象时返回该行；rows 场景回退为 view.currentRow
 */
export function resolveDataCapabilitiesFromDataKey(
  rawKey: string | undefined,
  dataSet: IDataSet | null | undefined,
): ResolvedDataCapabilities {
  if (!rawKey || !dataSet) {
    return {
      dataSource: null,
      dataRow: null,
    }
  }

  const binding = resolveDataKeyBinding(rawKey, dataSet)
  if (!binding) {
    return {
      dataSource: null,
      dataRow: null,
    }
  }

  if (binding.kind === 'view') {
    const dataSource = binding.source as DataView
    const currentRow = dataSource.currentRow
    return {
      dataSource,
      dataRow: isRowLike(currentRow) ? currentRow : null,
    }
  }

  const dataSource = getViewFromRawKey(rawKey, dataSet) ?? null
  return {
    dataSource,
    dataRow: isRowLike(binding.value) ? binding.value : null,
  }
}

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
  return resolveDataCapabilitiesFromDataKey(rawKey, dataSet).dataSource
}