/**
 * @module @spark-appworks/spark-project-model:page/instantiate-project-node
 * 职责：配置页节点实例化（page / sub-page 统一 ConfigPageNode）。
 */
import type { ProjectNode } from '../navigation/project-node'
import { isConfigNodeKind } from '../navigation/navigation-tree'
import { instantiateNavigationKindNode } from '../navigation/navigation-kinds'
import {
  ConfigPageNode,
  type ProjectConfigPageNodeModelOptions,
} from './config-page'

export function instantiateProjectNode(options: ProjectConfigPageNodeModelOptions): ProjectNode {
  const nodeKind = options.node.nodeKind ?? 'page'
  if (isConfigNodeKind(nodeKind)) return new ConfigPageNode(options)
  return instantiateNavigationKindNode(options)
}

export function isConfigPageNode(node: ProjectNode | null | undefined): node is ConfigPageNode {
  return node instanceof ConfigPageNode
}

export function isConfigSubPageNode(node: ProjectNode | null | undefined): node is ConfigPageNode {
  return node instanceof ConfigPageNode && node.isSubPage
}
