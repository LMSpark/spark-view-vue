import { ConfigPageNode, type ProjectConfigPageNodeModelOptions } from '../page/config-page'
import { ConfigSubPageNode } from '../page/config-sub-page'
import { isConfigNodeKind } from './helpers'
import { createKindNode } from './kinds'
import type { ProjectNode } from './node'

export function createProjectNodeModel(options: ProjectConfigPageNodeModelOptions): ProjectNode {
  const nodeKind = options.node.nodeKind ?? 'page'
  if (nodeKind === 'sub-page') return new ConfigSubPageNode(options)
  if (isConfigNodeKind(nodeKind)) return new ConfigPageNode(options)
  return createKindNode(options)
}

export function isConfigPageNode(node: ProjectNode | null | undefined): node is ConfigPageNode {
  return node instanceof ConfigPageNode
}

export function isConfigSubPageNode(node: ProjectNode | null | undefined): node is ConfigSubPageNode {
  return node instanceof ConfigSubPageNode
}
