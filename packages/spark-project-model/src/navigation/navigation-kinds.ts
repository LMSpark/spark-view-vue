/**
 * @module @spark-appworks/spark-project-model:navigation/navigation-kinds
 * 职责：按 nodeKind 实例化非配置页导航节点（统一 `ProjectNode`，family 由 nodeKind 派生）。
 */
import { ProjectNode, type ProjectNodeModelOptions } from './project-node'

export function instantiateNavigationKindNode(options: ProjectNodeModelOptions): ProjectNode {
  const kind = options.node.nodeKind ?? 'page'
  if (kind === 'page' || (kind as string) === 'sub-page') {
    throw new Error(`instantiateNavigationKindNode does not handle config page kind: ${kind}`)
  }
  return new ProjectNode(options)
}
