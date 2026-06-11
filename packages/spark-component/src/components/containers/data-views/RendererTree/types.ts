/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererTree/types
 * RendererTree 模块，属于 SPARK component table-level/data-view-container。
 * 组件目录: containers/data-views。
 * 导出 ClassModel symbol: RendererTreeApi（共 1 个 symbol）。
 */
import type { DataRow } from '@spark-appworks/spark-data'
import type { BaseCrudContainerApi } from '../../support/base-container-api.js'

/** Renderer Tree Api 的语义模型。 */
export type RendererTreeApi = BaseCrudContainerApi & {
  getTreeData(): DataRow[]
    getNativeTree(): unknown
    getCurrentNode(): DataRow | null
    setCurrentKey(key: string | number): void
    expandToNode(key: string | number): Promise<void>
    filter(keyword: string): void
    getCheckedNodes(leafOnly?: boolean, includeHalfChecked?: boolean): DataRow[]
    getCheckedKeys(): Array<string | number>
    setCheckedKeys(keys: Array<string | number>): void
    moveNode(nodeId: string | number, newParentId: string | number | null, index?: number): Promise<DataRow | null>
    appendNode(parentKey: string | number | null, nodeData: DataRow): void
    insertBefore(refKey: string | number, nodeData: DataRow): void
    insertAfter(refKey: string | number, nodeData: DataRow): void
    updateNode(key: string | number, patch: Partial<DataRow>): boolean
    removeNode(key: string | number): boolean}
