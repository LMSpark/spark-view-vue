import type { CrudResult, IDataRow, NestedTreeNode, NestedTreeSearchResult } from '@spark-view/spark-data'
import type { BaseContainerApi } from '../../support/base-container-api.js'

export interface RendererTreePath {
  pathIds: Array<string | number>
  pathNodes?: IDataRow[]
}

export interface RendererTableApi extends BaseContainerApi {
  getRows(): IDataRow[]
  getSelectedRows(): IDataRow[]
  query(): Promise<void>
  loadTreeNested(rootId?: string | number | null, limit?: number, depthLimit?: number): Promise<CrudResult<NestedTreeNode[]> | null>
  loadTreeChildren(parentId: string | number | null, limit?: number): Promise<IDataRow[]>
  loadTreePath(id: string | number): Promise<RendererTreePath | null>
  expandToNode(key: string | number): Promise<void>
  moveNode(nodeId: string | number, newParentId: string | number | null, index?: number): Promise<IDataRow | null>
  searchTreeNested(keyword: string, limit?: number): Promise<NestedTreeSearchResult[]>
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
