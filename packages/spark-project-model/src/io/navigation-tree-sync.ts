/**
 * @module @spark-appworks/spark-project-model:io/navigation-tree-sync
 * @spark-appworks/spark-project-model 的 io/navigation-tree-sync 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
import type { ProjectModelData, ProjectNodeData } from '../navigation/project-node'
import { buildNavRoot } from '../navigation/navigation-tree'
import { createNavigationNodeDraft, createNavigationNodePatch } from '../navigation/navigation-edit'
import type { NavigationClient } from './navigation-client'

type FlatNodeEntry = Readonly<{
  node: ProjectNodeData
  parentId: string | null
}>

function collectDescendantTreeNodes(
  nodes: readonly ProjectNodeData[],
  parentId: string | null,
  result: Map<string, FlatNodeEntry>,
): void {
  for (const node of nodes) {
    result.set(node.id, { node, parentId })
    if (Array.isArray(node.children) && node.children.length > 0) {
      collectDescendantTreeNodes(node.children, node.id, result)
    }
  }
}

function collectDesiredFlatNodes(children: readonly ProjectNodeData[], rootId: string): Map<string, FlatNodeEntry> {
  const result = new Map<string, FlatNodeEntry>()
  collectDescendantTreeNodes(children, rootId, result)
  return result
}

function collectServerFlatNodes(root: ProjectModelData): Map<string, FlatNodeEntry> {
  const rootId = root.id?.trim() ?? ''
  const result = new Map<string, FlatNodeEntry>()
  collectDescendantTreeNodes(root.children, rootId === '' ? null : rootId, result)
  return result
}

function patchChangedFields(
  previous: ProjectNodeData,
  next: ProjectNodeData,
): ReturnType<typeof createNavigationNodePatch>['patch'] | null {
  const { patch } = createNavigationNodePatch(createNavigationNodeDraft(next))
  const before = createNavigationNodePatch(createNavigationNodeDraft(previous)).patch
  const changed = JSON.stringify(patch) !== JSON.stringify(before)
  return changed ? patch : null
}

async function deleteNodesInSafeOrder(
  client: NavigationClient,
  idsToDelete: ReadonlySet<string>,
  serverFlat: ReadonlyMap<string, FlatNodeEntry>,
): Promise<void> {
  const pending = new Set(idsToDelete)
  while (pending.size > 0) {
    let progressed = false
    for (const id of [...pending]) {
      const hasPendingChild = [...serverFlat.entries()].some(
        ([childId, entry]) => pending.has(childId) && entry.parentId === id,
      )
      if (hasPendingChild) continue
      await client.deleteNode(id)
      pending.delete(id)
      progressed = true
    }
    if (!progressed) {
      throw new Error('navigation-tree-sync: unable to resolve delete order')
    }
  }
}

function siblingIndex(
  flat: ReadonlyMap<string, FlatNodeEntry>,
  id: string,
  parentId: string | null,
): number {
  const siblings = [...flat.values()].filter((entry) => entry.parentId === parentId)
  const index = siblings.findIndex((entry) => entry.node.id === id)
  return index >= 0 ? index : siblings.length
}

/**
 * 将内存中的 navigation children 树同步到远端（增量 add/update/delete）。
 */
export async function replaceNavigationChildrenRemote(
  client: NavigationClient,
  serverRoot: ProjectModelData,
  children: readonly ProjectNodeData[],
): Promise<ProjectModelData> {
  const rootId = serverRoot.id?.trim()
  if (rootId === undefined || rootId === '') {
    throw new Error('replaceNavigationChildrenRemote: server root id is required')
  }

  const desiredFlat = collectDesiredFlatNodes(children, rootId)
  const serverFlat = collectServerFlatNodes(serverRoot)

  const idsToDelete = new Set<string>()
  for (const id of serverFlat.keys()) {
    if (!desiredFlat.has(id)) idsToDelete.add(id)
  }
  if (idsToDelete.size > 0) {
    await deleteNodesInSafeOrder(client, idsToDelete, serverFlat)
  }

  const refreshedRoot = await client.loadRoot()
  const refreshedFlat = collectServerFlatNodes(refreshedRoot)

  const pendingAdds = [...desiredFlat.keys()].filter((id) => !refreshedFlat.has(id))
  while (pendingAdds.length > 0) {
    let progressed = false
    for (let index = pendingAdds.length - 1; index >= 0; index -= 1) {
      const id = pendingAdds[index]
      if (id === undefined) continue
      const entry = desiredFlat.get(id)
      if (entry === undefined) continue
      const parentId = entry.parentId
      if (parentId !== null && !refreshedFlat.has(parentId) && pendingAdds.includes(parentId)) {
        continue
      }
      const effectiveParentId = parentId === rootId ? null : parentId
      await client.addNode({
        ...(effectiveParentId === null ? {} : { parentId: effectiveParentId }),
        node: entry.node,
        index: siblingIndex(desiredFlat, id, parentId),
      })
      refreshedFlat.set(id, entry)
      pendingAdds.splice(index, 1)
      progressed = true
    }
    if (!progressed) {
      throw new Error('navigation-tree-sync: unable to resolve add order')
    }
  }

  const latestRoot = await client.loadRoot()
  const latestFlat = collectServerFlatNodes(latestRoot)
  for (const [id, entry] of desiredFlat) {
    const previous = latestFlat.get(id)?.node
    if (previous === undefined) continue
    const patch = patchChangedFields(previous, entry.node)
    if (patch !== null) {
      await client.updateNode(id, patch)
    }
  }

  return buildNavRoot([...children], latestRoot)
}
