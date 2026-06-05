/**
 * NavigationIndex — 导航的领域结构索引（内存加速，非存储形状）。
 *
 * DB 侧常为平铺行；模型侧用 pid → children 与树投影服务编辑与查询，与表布局不必一致。
 */
import type { ProjectNodeData, ProjectNodeLocation } from './node'
import { buildProjectNavigationTree, findFlatNodeLocation } from './helpers'

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

export class NavigationIndex<TNode extends NavigationTreeNodeLike> {
  private readonly nodesById: Map<string, TNode>
  private childrenByPid = new Map<string, TNode[]>()
  private treeCache: ProjectNodeData[] | null = null

  constructor(nodesById: Map<string, TNode>) {
    this.nodesById = nodesById
  }

  /** 节点集合变更后重建索引。 */
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
