/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererTable/types
 * RendererTable 模块，属于 SPARK component table-level/data-view-container。
 * 组件目录: containers/data-views。
 * 导出 ClassModel symbol: RendererTreePath, RendererTableApi（共 2 个 symbol）。
 */
import type { CrudResult, DataRow, NestedTreeNode, NestedTreeSearchResult } from '@spark-appworks/spark-data'
import type { BaseContainerApi } from '../../support/base-container-api.js'

/** Renderer Tree Path 的语义模型。 */
export type RendererTreePath = {
    /** path Ids 字段。 */
pathIds: Array<string | number>
    /** path Nodes 字段。 */
pathNodes?: DataRow[]}

/** Renderer Table Api 的语义模型。 */
export type RendererTableApi = BaseContainerApi & {
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
    getNativeTable(): unknown}
