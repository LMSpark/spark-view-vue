/** 配置页节点实例化——放在 page 层，避免 navigation 反向依赖 ConfigPageNode。 */
import type { ProjectNode } from '../navigation/project-node'
import { isConfigNodeKind } from '../navigation/navigation-tree'
import { instantiateNavigationKindNode } from '../navigation/navigation-kinds'
import {
  ConfigPageNode,
  ConfigSubPageNode,
  type ProjectConfigPageNodeModelOptions,
} from './config-page'

export function instantiateProjectNode(options: ProjectConfigPageNodeModelOptions): ProjectNode {
  const nodeKind = options.node.nodeKind ?? 'page'
  if (nodeKind === 'sub-page') return new ConfigSubPageNode(options)
  if (isConfigNodeKind(nodeKind)) return new ConfigPageNode(options)
  return instantiateNavigationKindNode(options)
}

export function isConfigPageNode(node: ProjectNode | null | undefined): node is ConfigPageNode {
  return node instanceof ConfigPageNode
}

export function isConfigSubPageNode(node: ProjectNode | null | undefined): node is ConfigSubPageNode {
  return node instanceof ConfigSubPageNode
}
