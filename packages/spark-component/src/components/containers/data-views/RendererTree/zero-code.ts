import { nextTick } from 'vue'
import type { DataView, IDataRow } from '@spark-view/spark-data'
import type { LoggerApi } from '@spark-view/spark-utils'
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

export interface TreeNode {
  id?: string | number
  label?: string
  name?: string
  children?: TreeNode[]
  disabled?: boolean
  [key: string]: unknown
}

export interface ElTreeNode {
  level: number
  expanded: boolean
  data?: IDataRow
  parent?: ElTreeNode | null
  [key: string]: unknown
}

export interface ElTreeComponent {
  [key: string]: unknown
}

export interface NativeTreeLike {
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
  getNode?: (key: string | number) => unknown
}

export interface NativeTreeNodeLike {
  expand?: () => void
  data?: IDataRow
}

export type TreeEventControl = CancellableControl

export type TreeEventHandler = (
  data: TreeNode,
  node: ElTreeNode,
  component: ElTreeComponent,
  control: TreeEventControl,
) => void | Promise<void>

interface RendererTreeBehaviorProps extends Readonly<Record<string, unknown>> {
  onNodeClick?: TreeEventHandler | undefined
  onNodeExpand?: TreeEventHandler | undefined
  onNodeCollapse?: TreeEventHandler | undefined
}

interface RendererTreeZeroCodeOptions {
  props: RendererTreeBehaviorProps
  resolvedView: ValueRef<DataView | null>
  treeData: ValueRef<IDataRow[]>
  nativeTreeRef: ValueRef<unknown>
  logger: LoggerApi
  nodeKeyField: ValueRef<string>
  treeIdField: ValueRef<string>
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
    const node = data as IDataRow | null | undefined
    const key = node?.[nodeKeyField.value]
    return typeof key === 'string' || typeof key === 'number' ? key : null
  }

  function getNativeTree(): NativeTreeLike | null {
    return getNativeRefValue<NativeTreeLike>(nativeTreeRef)
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
      return (tree.getCurrentNode() as IDataRow | null) ?? null
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
        const nativeNode = tree.getNode(pathId) as NativeTreeNodeLike | undefined
        nativeNode?.expand?.()
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
      return tree.getCheckedNodes(leafOnly, includeHalfChecked) as IDataRow[]
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
      if (refNode !== null && refNode !== undefined) tree.insertBefore?.(nodeData, refNode)
    },
    insertAfter(refKey, nodeData) {
      const tree = getNativeTree()
      if (!tree) return
      const refNode = tree.getNode?.(refKey)
      if (refNode !== null && refNode !== undefined) tree.insertAfter?.(nodeData, refNode)
    },
    updateNode(key, patch) {
      const tree = getNativeTree()
      if (!tree) return false
      const elNode = tree.getNode?.(key) as { data?: IDataRow } | undefined
      if (elNode?.data === undefined) return false
      Object.assign(elNode.data, patch)
      return true
    },
    removeNode(key) {
      const tree = getNativeTree()
      if (!tree) return false
      const elNode = tree.getNode?.(key)
      if (elNode === null || elNode === undefined) return false
      tree.remove?.(elNode)
      return true
    },
  }

  async function runTreeEvent(
    handler: TreeEventHandler | undefined,
    data: TreeNode,
    node: ElTreeNode,
    component: ElTreeComponent,
    autoHandle?: () => void,
  ): Promise<void> {
    const control = createCancellableControl()
    await handler?.(data, node, component, control)
    if (!control.cancel) {
      if (autoHandle) {
        autoHandle()
      }
    }
  }

  const handleNodeClick = async (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
    await runTreeEvent(props.onNodeClick, data, node, component, () => {
      const key = getNodeKey(data)
      if (key === null) {
        logger.warn('RendererTree node-click 跳过自动选中：节点缺少主键', {
          nodeKey: nodeKeyField.value,
          treeIdField: treeIdField.value,
        })
        return
      }
      resolvedView.value?.setCurrentRowById(key)
    })
  }

  const handleNodeExpand = async (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
    await runTreeEvent(props.onNodeExpand, data, node, component)
  }

  const handleNodeCollapse = async (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
    await runTreeEvent(props.onNodeCollapse, data, node, component)
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