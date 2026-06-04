import { nextTick } from 'vue'
import { isDataRow, type DataView, type DataRow } from '@spark-appworks/spark-data'
import type { LoggerApi } from '@spark-appworks/spark-utils'
import {
  createCancellableControl,
  type CancellableControl,
} from '../../../internal'
import type { ValueRef } from '../../../shared-types.js'
import {
  createContainerCrudContext,
  getNativeRefValue,
} from '../zero-code-shared.js'
import type { RendererTreeApi } from './types'

export type TreeNode = {
  id?: string | number
  label?: string
  name?: string
  children?: TreeNode[]
  disabled?: boolean
  [key: string]: unknown}

export type ElTreeNode = {
  level: number
  expanded: boolean
  data?: DataRow
  parent?: ElTreeNode | null
  [key: string]: unknown}

export type ElTreeComponent = {
  [key: string]: unknown}

export type NativeTreeLike = {
  getCurrentNode?: () => unknown
  setCurrentKey?: (key: string | number | null) => void
  filter?: (value: string) => void
  getCheckedNodes?: (leafOnly?: boolean, includeHalfChecked?: boolean) => unknown[]
  getCheckedKeys?: (leafOnly?: boolean) => Array<string | number>
  setCheckedKeys?: (keys: Array<string | number>, leafOnly?: boolean) => void
  append?: (data: unknown, parentNode: unknown) => void
  insertBefore?: (data: unknown, refNode: unknown) => void
  insertAfter?: (data: unknown, refNode: unknown) => void
  remove?: (nodeOrData: unknown) => void
  getNode?: (key: string | number) => NativeTreeNodeLike | undefined}

export type NativeTreeNodeLike = {
  expand?: () => void
  data?: DataRow}

export type TreeEventControl = {
  cancel: CancellableControl['cancel']}

export type TreeEventHandler = {
  (data: TreeNode, node: ElTreeNode, component: ElTreeComponent, control: TreeEventControl): void | Promise<void>}

type RendererTreeBehaviorProps = Readonly<Record<string, unknown>> & {
  onNodeClick?: TreeEventHandler | undefined
    onNodeExpand?: TreeEventHandler | undefined
    onNodeCollapse?: TreeEventHandler | undefined}

type RendererTreeZeroCodeOptions = {
  props: RendererTreeBehaviorProps
  resolvedView: ValueRef<DataView | null>
  treeData: ValueRef<DataRow[]>
  nativeTreeRef: ValueRef<unknown>
  logger: LoggerApi
  nodeKeyField: ValueRef<string>
  treeIdField: ValueRef<string>}

type TreeEventRunOptions = {
  handler: TreeEventHandler | undefined
  data: TreeNode
  node: ElTreeNode
  component: ElTreeComponent
  autoHandle?: () => void}

function isNativeTreeLike(value: unknown): value is NativeTreeLike {
  if (typeof value !== 'object' || value === null) return false
  return (!('getCurrentNode' in value) || typeof value.getCurrentNode === 'function')
    && (!('setCurrentKey' in value) || typeof value.setCurrentKey === 'function')
    && (!('filter' in value) || typeof value.filter === 'function')
    && (!('getCheckedNodes' in value) || typeof value.getCheckedNodes === 'function')
    && (!('getCheckedKeys' in value) || typeof value.getCheckedKeys === 'function')
    && (!('setCheckedKeys' in value) || typeof value.setCheckedKeys === 'function')
    && (!('append' in value) || typeof value.append === 'function')
    && (!('insertBefore' in value) || typeof value.insertBefore === 'function')
    && (!('insertAfter' in value) || typeof value.insertAfter === 'function')
    && (!('remove' in value) || typeof value.remove === 'function')
    && (!('getNode' in value) || typeof value.getNode === 'function')
}

function isNativeTreeNodeLike(value: unknown): value is NativeTreeNodeLike {
  if (typeof value !== 'object' || value === null) return false
  return (!('expand' in value) || typeof value.expand === 'function')
    && (!('data' in value) || isDataRow(value.data))
}

export function createRendererTreeZeroCode(options: RendererTreeZeroCodeOptions) {
  const {
    props,
    resolvedView,
    treeData,
    nativeTreeRef,
    nodeKeyField,
    treeIdField,
    logger,
  } = options

  function getNodeKey(data: unknown): string | number | null {
    if (!isDataRow(data)) return null
    const key = data[nodeKeyField.value]
    return typeof key === 'string' || typeof key === 'number' ? key : null
  }

  function getNativeTree(): NativeTreeLike | null {
    return getNativeRefValue(nativeTreeRef, isNativeTreeLike)
  }

  function syncCurrentByKey(key: string | number | null | undefined): void {
    const tree = getNativeTree()
    if (key === null || key === undefined) {
      resolvedView.value?.setCurrentRowById(null)
      tree?.setCurrentKey?.(null)
      return
    }
    resolvedView.value?.setCurrentRowById(key)
    tree?.setCurrentKey?.(key)
  }

  const {
    baseMethods: baseCrudMethods,
  } = createContainerCrudContext({
    props,
    resolvedView,
  })
  const { getDataSource, addRow, editRowById, removeRow } = baseCrudMethods

  const treeApi: RendererTreeApi = {
    getDataSource,
    getTreeData() {
      return treeData.value
    },
    getNativeTree() {
      return getNativeTree()
    },
    getCurrentNode() {
      const tree = getNativeTree()
      if (!tree || typeof tree.getCurrentNode !== 'function') return null
      const currentNode = tree.getCurrentNode()
      return isDataRow(currentNode) ? currentNode : null
    },
    setCurrentKey(key) {
      syncCurrentByKey(key)
    },
    async expandToNode(key) {
      const view = resolvedView.value
      if (!view) return

      const path = await view.loadTreePath(key)
      await view.expandTreeToNode(key)
      await nextTick()

      const tree = getNativeTree()
      if (!tree || typeof tree.getNode !== 'function') {
        syncCurrentByKey(key)
        return
      }
      for (const pathId of path.pathIds) {
        const nativeNode = tree.getNode(pathId)
        if (isNativeTreeNodeLike(nativeNode)) {
          nativeNode.expand?.()
        }
      }

      syncCurrentByKey(key)
    },
    filter(keyword) {
      const tree = getNativeTree()
      if (!tree || typeof tree.filter !== 'function') return
      tree.filter(keyword)
    },
    getCheckedNodes(leafOnly, includeHalfChecked) {
      const tree = getNativeTree()
      if (!tree || typeof tree.getCheckedNodes !== 'function') return []
      return tree.getCheckedNodes(leafOnly, includeHalfChecked).filter(isDataRow)
    },
    getCheckedKeys() {
      const tree = getNativeTree()
      if (!tree || typeof tree.getCheckedKeys !== 'function') return []
      return tree.getCheckedKeys()
    },
    setCheckedKeys(keys) {
      const tree = getNativeTree()
      if (!tree || typeof tree.setCheckedKeys !== 'function') return
      tree.setCheckedKeys(keys)
    },
    addRow,
    editRowById,
    removeRow,
    moveNode(nodeId, newParentId, index) {
      const view = resolvedView.value
      if (!view) return Promise.resolve(null)
      return view.moveTreeNode(nodeId, newParentId, index)
    },
    appendNode(parentKey, nodeData) {
      const tree = getNativeTree()
      if (!tree) return
      const parentNode = parentKey !== null ? tree.getNode?.(parentKey) : null
      tree.append?.(nodeData, parentNode ?? undefined)
    },
    insertBefore(refKey, nodeData) {
      const tree = getNativeTree()
      if (!tree) return
      const refNode = tree.getNode?.(refKey)
      if (refNode !== undefined) tree.insertBefore?.(nodeData, refNode)
    },
    insertAfter(refKey, nodeData) {
      const tree = getNativeTree()
      if (!tree) return
      const refNode = tree.getNode?.(refKey)
      if (refNode !== undefined) tree.insertAfter?.(nodeData, refNode)
    },
    updateNode(key, patch) {
      const tree = getNativeTree()
      if (!tree) return false
      const elNode = tree.getNode?.(key)
      if (!isNativeTreeNodeLike(elNode) || elNode.data === undefined) return false
      Object.assign(elNode.data, patch)
      return true
    },
    removeNode(key) {
      const tree = getNativeTree()
      if (!tree) return false
      const elNode = tree.getNode?.(key)
      if (elNode === undefined) return false
      tree.remove?.(elNode)
      return true
    },
  }

  async function runTreeEvent(eventOptions: TreeEventRunOptions): Promise<void> {
    const { handler, data, node, component, autoHandle } = eventOptions
    const control = createCancellableControl()
    await handler?.(data, node, component, control)
    if (!control.cancel) {
      if (autoHandle) {
        autoHandle()
      }
    }
  }

  const handleNodeClick = async (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
    await runTreeEvent({
      handler: props.onNodeClick,
      data,
      node,
      component,
      autoHandle: () => {
      const key = getNodeKey(data)
      if (key === null) {
        logger.warn('RendererTree node-click 跳过自动选中：节点缺少主键', {
          nodeKey: nodeKeyField.value,
          treeIdField: treeIdField.value,
        })
        return
      }
      resolvedView.value?.setCurrentRowById(key)
      },
    })
  }

  const handleNodeExpand = async (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
    await runTreeEvent({ handler: props.onNodeExpand, data, node, component })
  }

  const handleNodeCollapse = async (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
    await runTreeEvent({ handler: props.onNodeCollapse, data, node, component })
  }

  const handleNodeDrop = async (draggingNode: ElTreeNode, dropNode: ElTreeNode, dropType: string) => {
    const view = resolvedView.value
    if (!view) return

    const draggedKey = getNodeKey(draggingNode.data)
    if (draggedKey === null) return

    let newParentId: string | number | null = null
    if (dropType === 'inner') {
      newParentId = getNodeKey(dropNode.data)
    } else {
      // 取 dropNode 在树索引中的 parentId，避免手工解析行字段
      const dropNodeKey = getNodeKey(dropNode.data)
      newParentId = (dropNodeKey !== null ? view.treeManager?.getNode(dropNodeKey)?.parentId : null) ?? null
    }

    const moveTreeNode = ((nextNodeId: string | number, nextParentId: string | number | null, nextIndex?: number) =>
      view.moveTreeNode(nextNodeId, nextParentId, nextIndex))
    await moveTreeNode(draggedKey, newParentId, -1)
  }

  return {
    treeApi,
    getNodeKey,
    syncCurrentByKey,
    handleNodeClick,
    handleNodeExpand,
    handleNodeCollapse,
    handleNodeDrop,
  }
}
