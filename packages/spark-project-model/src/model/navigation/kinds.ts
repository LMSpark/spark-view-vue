/** 按 nodeKind 特化的导航节点 class（存储可平铺，领域按 kind 分层）。 */
import { ProjectNode, type ProjectNodeFamily, type ProjectNodeModelOptions } from './node'

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

/** system-page 节点 — 运行时映射到静态 Vue 组件（VUE_PAGE_MAP），无四文件。 */
export class VueComponentPageNode extends SystemPageNode {}

export class SystemActionNode extends ProjectNode {
  override get family(): ProjectNodeFamily { return 'system-action' }
}

export type AnyProjectNode =
  | ModuleNode
  | SystemDirectoryNode
  | LinkNode
  | RefNode
  | SystemPageNode
  | VueComponentPageNode
  | SystemActionNode

export function createKindNode(options: ProjectNodeModelOptions): AnyProjectNode {
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
      return new VueComponentPageNode(options)
    case 'system-action':
      return new SystemActionNode(options)
    case 'page':
    case 'sub-page':
      throw new Error(`createKindNode does not handle config page kind: ${kind}`)
    default:
      return new ModuleNode(options)
  }
}
