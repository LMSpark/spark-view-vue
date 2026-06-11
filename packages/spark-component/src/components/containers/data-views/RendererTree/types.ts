/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererTree/types
 * 职责：集中定义 RendererTree（r-tree）内部共享的类型契约，描述渲染器状态、事件载荷和运行时数据形态。
 * 边界：只提供 table-level/data-view-container 的类型层语义，不创建组件实例、不执行 IO，也不承载具体 UI 渲染。
 * AI用途：需要判断 renderer tree 的状态结构、事件参数或 zero-code API 形状时，用本模块作为类型入口。
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
