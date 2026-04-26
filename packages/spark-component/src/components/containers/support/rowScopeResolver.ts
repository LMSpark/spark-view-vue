import type { IDataRow } from '@spark-view/spark-data'

// 从上游行作用域提取 row；提取失败时回退到调用方提供的空行语义。
export function resolveRowScopeRow(
  scope: Record<string, unknown> | null | undefined,
  fallbackRow: IDataRow,
): IDataRow {
  const row = scope?.['row']
  return row !== null && row !== undefined && typeof row === 'object' && !Array.isArray(row)
    ? row as IDataRow
    : fallbackRow
}

