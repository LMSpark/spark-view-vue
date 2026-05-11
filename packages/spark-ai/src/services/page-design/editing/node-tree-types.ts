import type { SparkNode } from '@spark-view/spark-page-config'

export type SparkNodeTreeMethodKey =
  | 'getNode'
  | 'getLocation'
  | 'hasNode'
  | 'getParent'
  | 'listChildren'
  | 'countNodes'
  | 'getAllData'
  | 'collectHandlerNames'
  | 'findByType'
  | 'addNode'
  | 'addNodes'
  | 'moveNode'
  | 'setProps'
  | 'setPropsBatch'
  | 'replaceNode'
  | 'replaceNodes'
  | 'removeNode'
  | 'removeNodes'

export interface PageDesignNodeTree {
  getNode(params: unknown): unknown
  getLocation(params: unknown): unknown
  hasNode(params: unknown): unknown
  getParent(params: unknown): unknown
  listChildren(params?: unknown): unknown
  countNodes(params?: unknown): unknown
  toJSON(params?: unknown): SparkNode
  getAllData(params?: unknown): SparkNode
  collectHandlerNames(params?: unknown): unknown
  findByType(params: unknown): unknown
  addNode(params: unknown): unknown
  addNodes(params: unknown): unknown
  moveNode(params: unknown): unknown
  setProps(params: unknown): unknown
  setPropsBatch(params: unknown): unknown
  replaceNode(params: unknown): unknown
  replaceNodes(params: unknown): unknown
  removeNode(params: unknown): unknown
  removeNodes(params: unknown): unknown
}
