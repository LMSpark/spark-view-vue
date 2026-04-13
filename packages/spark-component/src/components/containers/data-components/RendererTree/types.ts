import type { IDataRow } from '@spark-view/spark-data'
import type { BaseCrudContainerApi } from '../../support/base-container-api.js'

export interface RendererTreeApi extends BaseCrudContainerApi {
  getTreeData(): IDataRow[]
  getNativeTree(): unknown
  getCurrentNode(): IDataRow | null
  setCurrentKey(key: string | number): void
  expandToNode(key: string | number): Promise<void>
  filter(keyword: string): void
  getCheckedKeys(): Array<string | number>
  setCheckedKeys(keys: Array<string | number>): void
  moveNode(nodeId: string | number, newParentId: string | number | null, index?: number): Promise<IDataRow | null>
  appendNode(parentKey: string | number | null, nodeData: IDataRow): void
  insertBefore(refKey: string | number, nodeData: IDataRow): void
  insertAfter(refKey: string | number, nodeData: IDataRow): void
  updateNode(key: string | number, patch: Partial<IDataRow>): boolean
  removeNode(key: string | number): boolean
  getAllowAppend(): boolean
  getAllowDelete(): boolean
}
