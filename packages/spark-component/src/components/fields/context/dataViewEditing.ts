import type { DataRow } from '@spark-view/spark-data'
import { isRecord } from '@spark-view/spark-utils'

export type DataViewEditingEventName =
  | 'editingFieldChanged'
  | 'editingChanged'
  | 'rowsChanged'
  | 'currentRowChanged'
  | 'selectedRowsChanged'
  | 'cleared'

export type DataViewEditingEvents = {
  on(eventName: DataViewEditingEventName, handler: () => void): void
  off(eventName: DataViewEditingEventName, handler: () => void): void}

export type DataViewEditingSource = {
  getPkKey(row: DataRow): string | number | undefined
  hasEditingChanges(id?: string | number): boolean
  getEditingRow(id: string | number): DataRow | null
  updateEditingValue(id: string | number, field: string, value: unknown): DataRow
  events?: DataViewEditingEvents}

export function isDataViewEditingSource(value: unknown): value is DataViewEditingSource {
  if (!isRecord(value)) return false
  return typeof value['getPkKey'] === 'function'
    && typeof value['hasEditingChanges'] === 'function'
    && typeof value['getEditingRow'] === 'function'
    && typeof value['updateEditingValue'] === 'function'
}

export function resolveDataViewEditingRow(source: unknown, row: DataRow | null): DataRow | null {
  if (!row || !isDataViewEditingSource(source)) return null
  const rowId = source.getPkKey(row)
  if (rowId === undefined || !source.hasEditingChanges(rowId)) return null
  return source.getEditingRow(rowId)
}

export type DataViewEditingWriteInput = Readonly<{
  source: unknown
  row: DataRow | null
  field: string
  value: unknown
}>

export function writeDataViewEditingValue(input: DataViewEditingWriteInput): boolean {
  const { source, row, field, value } = input
  if (!row || !isDataViewEditingSource(source)) return false
  const rowId = source.getPkKey(row)
  if (rowId === undefined) {
    throw new Error(`字段 "${field}" 绑定到 DataView，但当前行缺少可解析主键，无法写入编辑态`)
  }
  source.updateEditingValue(rowId, field, value)
  return true
}
