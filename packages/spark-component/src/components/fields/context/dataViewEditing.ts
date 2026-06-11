/**
 * @module @spark-appworks/spark-component:components/fields/context/dataViewEditing
 * 职责：维护 @spark-appworks/spark-component 中 components/fields/context/dataViewEditing 的模块能力，围绕 DataViewEditingEventName、DataViewEditingEvents、DataViewEditingSource 等 4 个公开契约 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/fields/context/dataViewEditing 的声明、导出和使用边界时，从本模块开始。
 */
import type { DataRow } from '@spark-appworks/spark-data'
import { isRecord } from '@spark-appworks/spark-utils'

/** Data View Editing Event Name 的语义模型。 */
export type DataViewEditingEventName =
  | 'editingFieldChanged'
  | 'editingChanged'
  | 'rowsChanged'
  | 'currentRowChanged'
  | 'selectedRowsChanged'
  | 'cleared'

/** Data View Editing Events 的语义模型。 */
export type DataViewEditingEvents = {
  on(eventName: DataViewEditingEventName, handler: () => void): void
  off(eventName: DataViewEditingEventName, handler: () => void): void}

/** Data View Editing Source 的语义模型。 */
export type DataViewEditingSource = {
  getPkKey(row: DataRow): string | number | undefined
  hasEditingChanges(id?: string | number): boolean
  getEditingRow(id: string | number): DataRow | null
  updateEditingValue(id: string | number, field: string, value: unknown): DataRow
    /** events 字段。 */
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

/** Data View Editing Write Input 的输入数据。 */
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
  if (rowId === undefined) return false
  source.updateEditingValue(rowId, field, value)
  return true
}
