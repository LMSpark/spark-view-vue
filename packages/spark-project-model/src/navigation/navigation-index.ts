/**
 * @module @spark-appworks/spark-project-model:navigation/navigation-index
 * 职责：提供项目模型和页面配置域中的 navigation index 能力，支撑 navigation、page content、project session 或远程 IO。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */
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
  /** 将索引节点转回完整 ProjectNodeData；用于从扁平索引重建树结构或输出持久化格式 */
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

