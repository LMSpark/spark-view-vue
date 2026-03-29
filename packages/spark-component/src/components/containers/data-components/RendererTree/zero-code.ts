import { nextTick } from 'vue'
import type { DataView, IDataRow } from '@spark-view/spark-data'
import type { IPageServiceCapability, LoggerApi } from '@spark-view/spark-utils'
import {
  createCancellableControl,
  type CancellableControl,
} from '../../../internal'
import type { SparkNode } from '../../../internal'
import type { ValueRef } from '../../../shared-types.js'
import { createBuiltinActionHandler, isBuiltinActionDisabled as _isBuiltinActionDisabled } from '../../builtin-actions'
import { createCancelledCrudResult, useEventDefaults } from '../../support/index.js'
import type { RendererTreeApi } from './types'

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */

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
  data?: Record<string, unknown>
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
  data?: Record<string, unknown>
}

export type TreeEventControl = CancellableControl

export type TreeEventHandler = (
  data: TreeNode,
  node: ElTreeNode,
  component: ElTreeComponent,
  control: TreeEventControl,
) => void | Promise<void>

export type TreeNodeActionHandler = (
  data: TreeNode,
  control: TreeEventControl,
) => void | Promise<void>

interface RendererTreeBehaviorProps extends Readonly<Record<string, unknown>> {
  onNodeClick?: TreeEventHandler | undefined
  onNodeExpand?: TreeEventHandler | undefined
  onNodeCollapse?: TreeEventHandler | undefined
  onNodeAppend?: TreeNodeActionHandler | undefined
  onNodeDelete?: TreeNodeActionHandler | undefined
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
  effectiveAllowAppend: ValueRef<boolean>
  effectiveAllowDelete: ValueRef<boolean>
}

type AddRowResult = Awaited<ReturnType<RendererTreeApi['addRow']>>
type EditRowResult = Awaited<ReturnType<RendererTreeApi['editRowById']>>
type RemoveRowResult = Awaited<ReturnType<RendererTreeApi['removeRow']>>
type MoveNodeResult = Awaited<ReturnType<RendererTreeApi['moveNode']>>

interface TreePathLike {
  pathIds: Array<string | number>
}

type LoadTreePathFn = (id: string | number) => Promise<TreePathLike>
type MoveTreeNodeFn = (nodeId: string | number, newParentId: string | number | null, index?: number) => Promise<MoveNodeResult>
type AddRowFn = (row: Partial<IDataRow>) => Promise<AddRowResult>
type EditRowFn = (id: string | number, patch: Partial<IDataRow>) => Promise<EditRowResult>
type RemoveRowFn = (id: string | number) => Promise<RemoveRowResult>

export function createRendererTreeZeroCode(options: RendererTreeZeroCodeOptions) {
  function getNodeKey(data: unknown): string | number | null {
    const node = data as Record<string, unknown> | null | undefined
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

  const { dispatch } = useEventDefaults({
    'add-row': {},
    'edit-row': {},
    'remove-row': {},
  }, options.props)

  const treeApi: RendererTreeApi = {
    getDataSource() {
      return options.resolvedView.value ?? null
    },
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

      const loadTreePath = view.loadTreePath.bind(view) as unknown as LoadTreePathFn
      const path = await loadTreePath(key)
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
    async addRow(row) {
      const view = options.resolvedView.value
      if (!view) return null
      const { cancel } = await dispatch('add-row', row)
      if (cancel) return createCancelledCrudResult<IDataRow>('addRow cancelled by business handler') as AddRowResult
      const addRow = view.addRow.bind(view) as unknown as AddRowFn
      const resultUnknown: unknown = await addRow(row)
      return resultUnknown as AddRowResult
    },
    async editRowById(id, patch) {
      const view = options.resolvedView.value
      if (!view) return false
      const { cancel } = await dispatch('edit-row', id, patch)
      if (cancel) return createCancelledCrudResult<IDataRow>('editRowById cancelled by business handler') as EditRowResult
      const editRowById = view.editRowById.bind(view) as unknown as EditRowFn
      const resultUnknown: unknown = await editRowById(id, patch)
      return resultUnknown as EditRowResult
    },
    async removeRow(id) {
      const view = options.resolvedView.value
      if (!view) return false
      const { cancel } = await dispatch('remove-row', id)
      if (cancel) return createCancelledCrudResult<boolean>('removeRow cancelled by business handler') as RemoveRowResult
      const removeRow = view.removeRow.bind(view) as unknown as RemoveRowFn
      const resultUnknown: unknown = await removeRow(id)
      return resultUnknown as RemoveRowResult
    },
    async moveNode(nodeId, newParentId, index) {
      const view = options.resolvedView.value
      if (!view) return null
      const moveTreeNode = ((nextNodeId: string | number, nextParentId: string | number | null, nextIndex?: number) =>
        view.moveTreeNode(nextNodeId, nextParentId, nextIndex)) as unknown as MoveTreeNodeFn
      const resultUnknown: unknown = await moveTreeNode(nodeId, newParentId, index)
      return resultUnknown as MoveNodeResult
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
      const elNode = tree.getNode?.(key) as { data?: Record<string, unknown> } | undefined
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
    getAllowAppend() {
      return options.effectiveAllowAppend.value
    },
    getAllowDelete() {
      return options.effectiveAllowDelete.value
    },
  }

  const builtinHandler = createBuiltinActionHandler({
    getView: () => options.resolvedView.value,
    getPageService: () => options.pageService,
    getLogger: () => options.logger,
    hasRemoteListApi: view => Boolean(view.dataTable?.api?.list),
  })

  function isBuiltinNodeActionDisabled(action: SparkNode, row: IDataRow, index: number): boolean {
    return _isBuiltinActionDisabled(action, options.resolvedView.value, { row, index })
  }

  function isBuiltinToolbarActionDisabled(action: SparkNode): boolean {
    return _isBuiltinActionDisabled(action, options.resolvedView.value)
  }

  function handleBuiltinToolbarAction(action: SparkNode): void {
    builtinHandler.handleToolbar(action)
  }

  function handleBuiltinNodeAction(action: SparkNode, row: IDataRow, index: number): void {
    builtinHandler.handleRow(action, row, index)
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

  async function runTreeNodeAction(
    handler: TreeNodeActionHandler | undefined,
    data: TreeNode,
    autoHandle?: () => void,
  ): Promise<void> {
    const control = createTreeEventControl()
    await handler?.(data, control)
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
      view.moveTreeNode(nextNodeId, nextParentId, nextIndex)) as unknown as MoveTreeNodeFn
    await moveTreeNode(draggedKey, newParentId, -1)
  }

  async function handleAppendNode(data: unknown) {
    const node = data as Record<string, unknown> | undefined
    const nodeKey = getNodeKey(node)
    await runTreeNodeAction(options.props.onNodeAppend, (node ?? {}) as TreeNode, () => {
      treeApi.appendNode(nodeKey, {})
    })
  }

  async function handleDeleteNode(data: unknown) {
    const node = data as Record<string, unknown> | undefined
    const nodeKey = getNodeKey(node)
    if (nodeKey === null) return
    await runTreeNodeAction(options.props.onNodeDelete, (node ?? {}) as TreeNode, () => {
      treeApi.removeNode(nodeKey)
    })
  }

  return {
    treeApi,
    getNodeKey,
    syncCurrentByKey,
    handleNodeClick,
    handleNodeExpand,
    handleNodeCollapse,
    handleNodeDrop,
    handleAppendNode,
    handleDeleteNode,
    isBuiltinNodeActionDisabled,
    isBuiltinToolbarActionDisabled,
    handleBuiltinToolbarAction,
    handleBuiltinNodeAction,
  }
}