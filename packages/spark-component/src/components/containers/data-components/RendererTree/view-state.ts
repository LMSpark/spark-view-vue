import { computed, nextTick, watch } from 'vue'
import { SparkData, type DataView } from '@spark-view/spark-data'
import type { TreeNode, NativeTreeLike, NativeTreeNodeLike } from './zero-code'
import type { ValueRef } from '../../../shared-types.js'
import { useDataViewState } from '../useDataViewState'

interface TreeManagerSeedNode extends Record<string, unknown> {
  id: string | number
  name: string
  parentId?: string | number | null
}

interface RendererTreeViewStateProps {
  nodeKey?: string | undefined
  currentKey?: string | number | null | undefined
  expandToKey?: string | number | null | undefined
  expandLevel?: number | undefined
}

interface RendererTreeViewStateOptions {
  props: RendererTreeViewStateProps
  resolvedView: ValueRef<DataView | null | undefined>
  nodeKeyField: ValueRef<string>
  treeIdField: ValueRef<string>
  nativeTreeRef: ValueRef<unknown>
  syncCurrentByKey: (key: string | number | null | undefined) => void
  expandToNode: (key: string | number) => Promise<void>
  getNodeKey: (data: unknown) => string | number | null
}

export function useRendererTreeViewState(options: RendererTreeViewStateOptions) {
  const {
    rows,
    currentRow,
    treeConfig,
  } = useDataViewState(options.resolvedView)

  const labelField = computed(() =>
    treeConfig.value?.textField ?? 'label'
  )

  function getNodeLabel(data: unknown): string {
    const node = data as Record<string, unknown> | undefined
    if (!node) return '节点'
    const value = node[labelField.value]
    if (typeof value === 'string') return value
    return (node['label'] as string | undefined)
      ?? (node['name'] as string | undefined)
      ?? (node['title'] as string | undefined)
      ?? '节点'
  }

  const treeData = computed<TreeNode[]>(() => {
    const resolvedRows = rows.value as TreeNode[]
    if (resolvedRows.length === 0) return []
    if (resolvedRows.some(row => Array.isArray(row.children))) return resolvedRows
    if (!treeConfig.value) return resolvedRows

    const parentIdField = treeConfig.value.parentIdField ?? 'parentId'
    const seedNodes: TreeManagerSeedNode[] = resolvedRows.flatMap(row => {
      const rawId = row[options.treeIdField.value]
      if (typeof rawId !== 'string' && typeof rawId !== 'number') {
        return []
      }

      const rawParentId = row[parentIdField]
      const parentId = typeof rawParentId === 'string' || typeof rawParentId === 'number'
        ? rawParentId
        : rawParentId === null || rawParentId === undefined
          ? null
          : String(rawParentId)

      return [{
        ...row,
        id: rawId,
        parentId,
        name: getNodeLabel(row),
      }]
    })

    return SparkData.createTreeManager({
      idField: options.treeIdField.value,
      parentIdField,
      textField: treeConfig.value.textField ?? 'label',
      treeMode: 'nested',
    }, seedNodes).buildNestedTree() as TreeNode[]
  })

  const elTreeFieldProps = computed(() => ({
    children: 'children',
    label: labelField.value,
  }))

  watch(
    currentRow,
    async nextCurrentRow => {
      await nextTick()
      const tree = options.nativeTreeRef.value as NativeTreeLike | null
      if (!tree?.setCurrentKey) return
      const key = options.getNodeKey(nextCurrentRow)
      tree.setCurrentKey(key ?? null)
    },
    { immediate: true }
  )

  watch(
    [() => treeData.value, () => options.props.expandLevel],
    async ([nextTreeRows, expandLevel]) => {
      if (nextTreeRows.length === 0 || expandLevel === undefined) return
      await applyExpandLevel(treeData.value, options.nativeTreeRef, options.getNodeKey, expandLevel)
    },
    { immediate: true }
  )

  watch(
    [() => treeData.value.length, () => options.props.currentKey],
    async ([rowCount, currentKey]) => {
      if (rowCount === 0 || currentKey === undefined) return
      await nextTick()
      options.syncCurrentByKey(currentKey)
    },
    { immediate: true }
  )

  watch(
    [() => treeData.value.length, () => options.props.expandToKey],
    async ([rowCount, expandToKey]) => {
      if (rowCount === 0 || expandToKey === null || expandToKey === undefined) return
      await options.expandToNode(expandToKey)
    },
    { immediate: true }
  )

  return {
    treeData,
    elTreeFieldProps,
    getNodeLabel,
  }
}

async function applyExpandLevel(
  treeData: TreeNode[],
  nativeTreeRef: ValueRef<unknown>,
  getNodeKey: (data: unknown) => string | number | null,
  level: number,
): Promise<void> {
  if (!Number.isFinite(level) || level < 2) return
  await nextTick()
  const tree = nativeTreeRef.value as NativeTreeLike | null
  for (const key of collectExpandKeysByLevel(treeData, getNodeKey, level)) {
    const nativeNode = tree?.getNode?.(key) as NativeTreeNodeLike | undefined
    nativeNode?.expand?.()
  }
}

function collectExpandKeysByLevel(
  nodes: TreeNode[],
  getNodeKey: (data: unknown) => string | number | null,
  targetLevel: number,
  currentLevel = 1,
): Array<string | number> {
  const result: Array<string | number> = []
  if (targetLevel <= 1) return result

  for (const node of nodes) {
    const key = getNodeKey(node)
    if (key !== null && currentLevel < targetLevel) {
      result.push(key)
    }
    const children = Array.isArray(node.children) ? node.children : []
    if (children.length > 0 && currentLevel < targetLevel) {
      result.push(...collectExpandKeysByLevel(children, getNodeKey, targetLevel, currentLevel + 1))
    }
  }

  return result
}