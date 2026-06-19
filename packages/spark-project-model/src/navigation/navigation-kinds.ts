/**
 * @module @spark-appworks/spark-project-model:navigation/navigation-kinds
 * 职责：按 nodeKind 实例化非配置页导航节点（统一 `ProjectNode`，family 由 nodeKind 派生）。
 * 边界：不处理 page/sub-page 配置页；配置页由 instantiate-project-node 路由到 ConfigPageNode。
 * AI用途：扩展导航 nodeKind 或排查非配置页节点实例化时，用本模块确认默认 ProjectNode 构造路径。
 */
import { ProjectNode, type ProjectNodeModelOptions } from './project-node'

export function instantiateNavigationKindNode(options: ProjectNodeModelOptions): ProjectNode {
  const kind = options.node.nodeKind ?? 'page'
  if (kind === 'page' || isLegacySubPageKind(kind)) {
    throw new Error(`instantiateNavigationKindNode does not handle config page kind: ${kind}`)
  }
  return new ProjectNode(options)
}

function isLegacySubPageKind(kind: unknown): boolean {
  return kind === 'sub-page'
}
