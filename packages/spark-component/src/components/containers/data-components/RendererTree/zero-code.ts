import { nextTick } from 'vue'
import type { DataView, IDataRow } from '@spark-view/spark-data'
import type { IPageServiceCapability } from '../../../internal'
import type { LoggerApi } from '@spark-view/spark-utils'
import {
  createCancellableControl,
  type CancellableControl,
} from '../../../internal'
import type { SparkNode } from '../../../internal'
import type { ValueRef } from '../../../shared-types.js'
import { createBuiltinActionHandler } from '../../support/actions/builtin-action-handler'
import { isBuiltinActionDisabled } from '../../support/actions/builtin-action-disabled'
import { hasRemoteListApi } from '../../support/actions/builtin-action-helpers'
import { createBaseCrudMethods, createCrudDispatcher } from '../../support/index.js'
import type { RendererTreeApi } from './types'
import type { BuiltinActionScope } from '../../../../page/actions/index.js'

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
  resolvedView: ValueRef<DataView | null | undefined>
  treeData: ValueRef<IDataRow[]>
  nativeTreeRef: ValueRef<unknown>
  logger: LoggerApi
  pageService: IPageServiceCapability | null | undefined
  nodeKeyField: ValueRef<string>
  treeIdField: ValueRef<string>
}

export function createRendererTreeZeroCode(options: RendererTreeZeroCodeOptions) {
  function getNodeKey(data: unknown): string | number | null {
    const node = data as IDataRow | null | undefined
    const key = node?.[options.nodeKeyField.value]
    return typeof key === 'string' || typeof key === 'number' ? key : null
  }

  function syncCurrentByKey(key: string | number | null | undefined): void {
    const tree = options.nativeTreeRef.value as NativeTreeLike | null
    if (key === null || key === undefined) {
      options.resolvedView.value?.setCurrentRowById(null)
      tree?.setCurrentKey?.(null)
      return
    }
    options.resolvedView.value?.setCurrentRowById(key)
    tree?.setCurrentKey?.(key)
  }

  const { dispatch } = createCrudDispatcher(options.props)

  const baseCrudMethods = createBaseCrudMethods(options.resolvedView, dispatch)
  const { getDataSource, addRow, editRowById, removeRow } = baseCrudMethods

  const treeApi: RendererTreeApi = {
    getDataSource,
    getTreeData() {
      return options.treeData.value
    },
    getNativeTree() {
      return options.nativeTreeRef.value
    },
    getCurrentNode() {
      const tree = options.nativeTreeRef.value as NativeTreeLike | null
      if (!tree || typeof tree.getCurrentNode !== 'function') return null
      return (tree.getCurrentNode() as IDataRow | null) ?? null
    },
    setCurrentKey(key) {
      syncCurrentByKey(key)
    },
    async expandToNode(key) {
      const view = options.resolvedView.value
      if (!view) return

      const path = await view.loadTreePath(key)
      await view.expandTreeToNode(key)
      await nextTick()

      const tree = options.nativeTreeRef.value as NativeTreeLike | null
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
      const tree = options.nativeTreeRef.value as NativeTreeLike | null
      if (!tree || typeof tree.filter !== 'function') return
      tree.filter(keyword)
    },
    getCheckedKeys() {
      const tree = options.nativeTreeRef.value as NativeTreeLike | null
      if (!tree || typeof tree.getCheckedKeys !== 'function') return []
      return tree.getCheckedKeys()
    },
    setCheckedKeys(keys) {
      const tree = options.nativeTreeRef.value as NativeTreeLike | null
      if (!tree || typeof tree.setCheckedKeys !== 'function') return
      tree.setCheckedKeys(keys)
    },
    addRow,
    editRowById,
    removeRow,
    moveNode(nodeId, newParentId, index) {
      const view = options.resolvedView.value
      if (!view) return Promise.resolve(null)
      return view.moveTreeNode(nodeId, newParentId, index)
    },
    appendNode(parentKey, nodeData) {
      const tree = options.nativeTreeRef.value as NativeTreeLike | null
      if (!tree) return
      const parentNode = parentKey !== null ? tree.getNode?.(parentKey) : null
      tree.append?.(nodeData, parentNode ?? undefined)
    },
    insertBefore(refKey, nodeData) {
      const tree = options.nativeTreeRef.value as NativeTreeLike | null
      if (!tree) return
      const refNode = tree.getNode?.(refKey)
      if (refNode !== null && refNode !== undefined) tree.insertBefore?.(nodeData, refNode)
    },
    insertAfter(refKey, nodeData) {
      const tree = options.nativeTreeRef.value as NativeTreeLike | null
      if (!tree) return
      const refNode = tree.getNode?.(refKey)
      if (refNode !== null && refNode !== undefined) tree.insertAfter?.(nodeData, refNode)
    },
    updateNode(key, patch) {
      const tree = options.nativeTreeRef.value as NativeTreeLike | null
      if (!tree) return false
      const elNode = tree.getNode?.(key) as { data?: IDataRow } | undefined
      if (elNode?.data === undefined) return false
      Object.assign(elNode.data, patch)
      return true
    },
    removeNode(key) {
      const tree = options.nativeTreeRef.value as NativeTreeLike | null
      if (!tree) return false
      const elNode = tree.getNode?.(key)
      if (elNode === null || elNode === undefined) return false
      tree.remove?.(elNode)
      return true
    },
  }

  const builtinActionHandler = createBuiltinActionHandler({
    getView: () => options.resolvedView.value,
    getPageService: () => options.pageService,
    getLogger: () => options.logger,
    hasRemoteListApi,
  })

  function isBuiltinNodeActionDisabled(action: SparkNode, row: IDataRow, index: number): boolean {
    const scope: BuiltinActionScope = { row, index }
    return isBuiltinActionDisabled(action, options.resolvedView.value, scope)
  }

  function isBuiltinToolbarActionDisabled(action: SparkNode): boolean {
    return isBuiltinActionDisabled(action, options.resolvedView.value)
  }

  function handleBuiltinToolbarAction(action: SparkNode): void {
    builtinActionHandler.handleToolbar(action)
  }

  function handleBuiltinNodeAction(action: SparkNode, row: IDataRow, index: number): void {
    builtinActionHandler.handleRow(action, row, index)
  }

  function createTreeEventControl(): TreeEventControl {
    return createCancellableControl()
  }

  async function runTreeEvent(
    handler: TreeEventHandler | undefined,
    data: TreeNode,
    node: ElTreeNode,
    component: ElTreeComponent,
    autoHandle?: () => void,
  ): Promise<void> {
    const control = createTreeEventControl()
    await handler?.(data, node, component, control)
    if (!control.cancel) {
      if (autoHandle) {
        autoHandle()
      }
    }
  }

  const handleNodeClick = async (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
    await runTreeEvent(options.props.onNodeClick, data, node, component, () => {
      const key = getNodeKey(data)
      if (key === null) {
        options.logger.warn('RendererTree node-click 跳过自动选中：节点缺少主键', {
          nodeKey: options.nodeKeyField.value,
          treeIdField: options.treeIdField.value,
        })
        return
      }
      options.resolvedView.value?.setCurrentRowById(key)
    })
  }

  const handleNodeExpand = async (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
    await runTreeEvent(options.props.onNodeExpand, data, node, component)
  }

  const handleNodeCollapse = async (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
    await runTreeEvent(options.props.onNodeCollapse, data, node, component)
  }

  const handleNodeDrop = async (draggingNode: ElTreeNode, dropNode: ElTreeNode, dropType: string) => {
    const view = options.resolvedView.value
    if (!view) return

    const draggedKey = getNodeKey(draggingNode.data)
    if (draggedKey === null) return

    const parentIdField = options.resolvedView.value?.treeConfig?.parentIdField ?? 'parentId'
    let newParentId: string | number | null = null
    if (dropType === 'inner') {
      newParentId = getNodeKey(dropNode.data)
    } else {
      const rawParentId = dropNode.data?.[parentIdField]
      newParentId = typeof rawParentId === 'string' || typeof rawParentId === 'number'
        ? rawParentId
        : rawParentId === null || rawParentId === undefined
          ? null
          : String(rawParentId)
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
    isBuiltinNodeActionDisabled,
    isBuiltinToolbarActionDisabled,
    handleBuiltinToolbarAction,
    handleBuiltinNodeAction,
  }
}