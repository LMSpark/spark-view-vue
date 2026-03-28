import type { CrudResult, IDataSource, IDataRow, NestedTreeNode, NestedTreeSearchResult } from '@spark-view/spark-data'

export interface RendererTreePath {
  pathIds: Array<string | number>
  pathNodes?: IDataRow[]
}

export interface RendererTableApi {
  getDataSource(): IDataSource | null
  getRows(): IDataRow[]
  getCurrentRow(): IDataRow | null
  getSelectedRows(): IDataRow[]
  refresh(): Promise<void>
  query(): Promise<void>
  loadTreeNested(rootId?: string | number | null, limit?: number, depthLimit?: number): Promise<CrudResult<NestedTreeNode[]> | null>
  loadTreeChildren(parentId: string | number | null, limit?: number): Promise<IDataRow[]>
  loadTreePath(id: string | number): Promise<RendererTreePath | null>
  expandToNode(key: string | number): Promise<void>
  moveNode(nodeId: string | number, newParentId: string | number | null, index?: number): Promise<IDataRow | null>
  searchTreeNested(keyword: string, limit?: number): Promise<NestedTreeSearchResult[]>
  addRow(row: Partial<IDataRow>): Promise<IDataRow | CrudResult<IDataRow> | null>
  editRowById(id: string | number, patch: Partial<IDataRow>): Promise<boolean | CrudResult<IDataRow>>
  removeRow(id: string | number): Promise<boolean | CrudResult<boolean>>
  appendRow(row: IDataRow): void
  updateRowById(id: string | number, patch: Partial<IDataRow>): boolean
  deleteRowById(id: string | number): boolean
  setCurrentRow(row: IDataRow | null): void
  setCurrentRowById(id: string | number | null): boolean
  setSelectedRows(rows: IDataRow[]): void
  setSelectedRowsById(ids: Array<string | number>): number
  clearSelectedRows(): void
  clearUiSelection(): void
  toggleUiRowSelection(row: IDataRow, selected?: boolean): void
  doLayout(): void
  getNativeTable(): unknown
  getFilterModel(): Record<string, unknown>
  resetFilters(): void
  hasActiveFilters(): boolean
  getActiveFilterCount(): number
}
