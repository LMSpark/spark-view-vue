import type { CrudResult, DataRow, NestedTreeNode, NestedTreeSearchResult } from '@spark-view/spark-data'
import type { BaseContainerApi } from '../../support/base-container-api.js'

export interface RendererTreePath {
  pathIds: Array<string | number>
  pathNodes?: DataRow[]
}

export interface RendererTableApi extends BaseContainerApi {
  getRows(): DataRow[]
  getSelectedRows(): DataRow[]
  query(): Promise<void>
  loadTreeNested(rootId?: string | number | null, limit?: number, depthLimit?: number): Promise<CrudResult<NestedTreeNode[]> | null>
  loadTreeChildren(parentId: string | number | null, limit?: number): Promise<DataRow[]>
  loadTreePath(id: string | number): Promise<RendererTreePath | null>
  expandToNode(key: string | number): Promise<void>
  moveNode(nodeId: string | number, newParentId: string | number | null, index?: number): Promise<DataRow | null>
  searchTreeNested(keyword: string, limit?: number): Promise<NestedTreeSearchResult[]>
  setSelectedRows(rows: DataRow[]): void
  setSelectedRowsById(ids: Array<string | number>): number
  clearSelectedRows(): void
  clearUiSelection(): void
  toggleUiRowSelection(row: DataRow, selected?: boolean): void
  doLayout(): void
  getNativeTable(): unknown
}
