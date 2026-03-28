import type { CrudResult, IDataSource, IDataRow } from '@spark-view/spark-data'

export interface RendererDetailApi {
  getDataSource(): IDataSource | null
  refresh(): Promise<void>
  addRow(row: Partial<IDataRow>): Promise<IDataRow | CrudResult<IDataRow> | null>
  editRowById(id: string | number, patch: Partial<IDataRow>): Promise<boolean | CrudResult<IDataRow>>
  removeRow(id: string | number): Promise<boolean | CrudResult<boolean>>
  appendRow(row: IDataRow): void
  updateRowById(id: string | number, patch: Partial<IDataRow>): boolean
  deleteRowById(id: string | number): boolean
  setCurrentRow(row: IDataRow | null): void
  setCurrentRowById(id: string | number | null): boolean
  getDetailData(): Record<string, unknown>
  getCurrentRow(): IDataRow | null
  getFieldValue(field: string): unknown
}
