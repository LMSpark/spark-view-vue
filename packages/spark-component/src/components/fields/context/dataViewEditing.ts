import type { DataViewChangeEvent, IDataRow, PkValue } from '@spark-view/spark-data'

export interface DataViewEditingSource {
  getPkKey(row: IDataRow): PkValue | undefined
  hasEditingChanges(id?: PkValue): boolean
  getEditingRow(id: PkValue): IDataRow | null
  updateEditingValue(id: PkValue, field: string, value: unknown): IDataRow
  subscribe?: (listener: (change: DataViewChangeEvent) => void) => () => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

export function isDataViewEditingSource(value: unknown): value is DataViewEditingSource {
  if (!isRecord(value)) return false
  return typeof value['getPkKey'] === 'function'
    && typeof value['hasEditingChanges'] === 'function'
    && typeof value['getEditingRow'] === 'function'
    && typeof value['updateEditingValue'] === 'function'
}

export function resolveDataViewEditingRow(source: unknown, row: IDataRow | null): IDataRow | null {
  if (!row || !isDataViewEditingSource(source)) return null
  const rowId = source.getPkKey(row)
  if (rowId === undefined || !source.hasEditingChanges(rowId)) return null
  return source.getEditingRow(rowId)
}

export function writeDataViewEditingValue(source: unknown, row: IDataRow | null, field: string, value: unknown): boolean {
  if (!row || !isDataViewEditingSource(source)) return false
  const rowId = source.getPkKey(row)
  if (rowId === undefined) {
    throw new Error(`字段 "${field}" 绑定到 DataView，但当前行缺少可解析主键，无法写入编辑态`)
  }
  source.updateEditingValue(rowId, field, value)
  return true
}
