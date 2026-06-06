/** 按 nodeKind 特化的导航节点 class（仅非配置页 kind；不含 page/sub-page）。 */
import { ProjectNode, type ProjectNodeFamily, type ProjectNodeModelOptions } from './project-node'

export class ModuleNode extends ProjectNode {
  override get family(): ProjectNodeFamily { return 'module' }
}

export class SystemDirectoryNode extends ProjectNode {
  override get family(): ProjectNodeFamily { return 'module' }
}

export class LinkNode extends ProjectNode {
  override get family(): ProjectNodeFamily { return 'link' }
}

export class RefNode extends ProjectNode {
  override get family(): ProjectNodeFamily { return 'ref' }
}

export class SystemPageNode extends ProjectNode {
  override get family(): ProjectNodeFamily { return 'system-page' }
}

export class SystemActionNode extends ProjectNode {
  override get family(): ProjectNodeFamily { return 'system-action' }
}

export type AnyProjectNode =
  | ModuleNode
  | SystemDirectoryNode
  | LinkNode
  | RefNode
  | SystemPageNode
  | SystemActionNode

export function instantiateNavigationKindNode(options: ProjectNodeModelOptions): AnyProjectNode {
  const kind = options.node.nodeKind ?? 'page'
  switch (kind) {
    case 'system-directory':
      return new SystemDirectoryNode(options)
    case 'module':
      return new ModuleNode(options)
    case 'link':
      return new LinkNode(options)
    case 'ref':
      return new RefNode(options)
    case 'system-page':
      return new SystemPageNode(options)
    case 'system-action':
      return new SystemActionNode(options)
    case 'page':
    case 'sub-page':
      throw new Error(`instantiateNavigationKindNode does not handle config page kind: ${kind}`)
    default:
      return new ModuleNode(options)
  }
}
