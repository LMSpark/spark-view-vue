/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererTable/types
 * 职责：集中定义 RendererTable（r-table）内部共享的类型契约，描述渲染器状态、事件载荷和运行时数据形态。
 * 边界：只提供 table-level/data-view-container 的类型层语义，不创建组件实例、不执行 IO，也不承载具体 UI 渲染。
 * AI用途：需要判断 renderer table 的状态结构、事件参数或 zero-code API 形状时，用本模块作为类型入口。
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
