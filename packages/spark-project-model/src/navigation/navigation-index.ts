/** NavigationIndex — 导航 nodesById 的内存索引（树投影 / 查找），非存储形状。 */
import type { ProjectNodeData, ProjectNodeLocation } from './project-node'
import { buildProjectNavigationTree, findFlatNodeLocation } from './navigation-tree'

/** Navigation Tree Node Like 的语义模型。 */
export type NavigationTreeNodeLike = {
    /** 唯一标识。 */
readonly id: string
    /** pid 字段。 */
readonly pid: string
    /** order 字段。 */
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

    /** 创建 Navigation Index 实例。 */
constructor(nodesById: Map<string, TNode>) {
    this.nodesById = nodesById
  }

    /** 执行 rebuild 操作。 */
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

    /** 执行 invalidate Tree 操作。 */
invalidateTree(): void {
    this.treeCache = null
  }

    /** 读取 Children。 */
getChildren(pid: string): readonly TNode[] {
    return this.childrenByPid.get(pid.trim()) ?? []
  }

    /** 执行 collect Descendants 操作。 */
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

    /** 执行 next Child Order 操作。 */
nextChildOrder(pid: string): number {
    const siblings = this.getChildren(pid)
    let max = -1
    for (const node of siblings) max = Math.max(max, node.order)
    return max + 1
  }

    /** 执行 build Tree 操作。 */
buildTree(): ProjectNodeData[] {
    if (this.treeCache !== null) return this.treeCache
    this.treeCache = buildProjectNavigationTree(this.nodesById.values())
    return this.treeCache
  }

    /** 执行 find Node Location 操作。 */
findNodeLocation(targetId: string): ProjectNodeLocation | null {
    return findFlatNodeLocation(this.nodesById, (pid) => this.getChildren(pid), targetId)
  }
}

