/** NavigationIndex — 导航 nodesById 的内存索引（树投影 / 查找），非存储形状。 */
import type { ProjectNodeData, ProjectNodeLocation } from './project-node'
import { buildProjectNavigationTree, findFlatNodeLocation } from './navigation-tree'

export type NavigationTreeNodeLike = {
  readonly id: string
  readonly pid: string
  readonly order: number
  toNodeData(): ProjectNodeData
}

export function compareNavigationNodes(
  a: NavigationTreeNodeLike,
  b: NavigationTreeNodeLike,
): number {
  return a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id)
}

/**
 * 导航索引：id → node 映射 + pid → children 查询。
 */
export class NavigationIndex<TNode extends NavigationTreeNodeLike> {
  private readonly nodesById: Map<string, TNode>
  private childrenByPid = new Map<string, TNode[]>()
  private treeCache: ProjectNodeData[] | null = null

  constructor(nodesById: Map<string, TNode>) {
    this.nodesById = nodesById
  }

  rebuild(): void {
    this.childrenByPid.clear()
    this.treeCache = null
    for (const node of this.nodesById.values()) {
      const pid = node.pid
      let bucket = this.childrenByPid.get(pid)
      if (!bucket) {
        bucket = []
        this.childrenByPid.set(pid, bucket)
      }
      bucket.push(node)
    }
    for (const bucket of this.childrenByPid.values()) {
      bucket.sort(compareNavigationNodes)
    }
  }

  invalidateTree(): void {
    this.treeCache = null
  }

  getChildren(pid: string): readonly TNode[] {
    return this.childrenByPid.get(pid.trim()) ?? []
  }

  collectDescendants(nodeId: string): TNode[] {
    const result: TNode[] = []
    const stack = [...this.getChildren(nodeId)]
    while (stack.length > 0) {
      const node = stack.pop()
      if (node === undefined) continue
      result.push(node)
      stack.push(...this.getChildren(node.id))
    }
    return result
  }

  nextChildOrder(pid: string): number {
    const siblings = this.getChildren(pid)
    let max = -1
    for (const node of siblings) max = Math.max(max, node.order)
    return max + 1
  }

  buildTree(): ProjectNodeData[] {
    if (this.treeCache !== null) return this.treeCache
    this.treeCache = buildProjectNavigationTree(this.nodesById.values())
    return this.treeCache
  }

  findNodeLocation(targetId: string): ProjectNodeLocation | null {
    return findFlatNodeLocation(this.nodesById, (pid) => this.getChildren(pid), targetId)
  }
}

