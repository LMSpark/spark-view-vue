/**
 * @module @spark-appworks/spark-project-model:navigation/navigation-kinds
 * 职责：提供项目模型和页面配置域中的 navigation kinds 能力，支撑 navigation、page content、project session 或远程 IO。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */
/** 按 nodeKind 特化的导航节点 class（仅非配置页 kind；不含 page/sub-page）。 */
import { ProjectNode, type ProjectNodeFamily, type ProjectNodeModelOptions } from './project-node'

/** Module Node 的语义模型。 */
export class ModuleNode extends ProjectNode {
  override get family(): ProjectNodeFamily { return 'module' }
}

/** System Directory Node 的语义模型。 */
export class SystemDirectoryNode extends ProjectNode {
  override get family(): ProjectNodeFamily { return 'module' }
}

/** Link Node 的语义模型。 */
export class LinkNode extends ProjectNode {
  override get family(): ProjectNodeFamily { return 'link' }
}

/** Ref Node 的语义模型。 */
export class RefNode extends ProjectNode {
  override get family(): ProjectNodeFamily { return 'ref' }
}

/** System Page Node 的语义模型。 */
export class SystemPageNode extends ProjectNode {
  override get family(): ProjectNodeFamily { return 'system-page' }
}

/** System Action Node 的语义模型。 */
export class SystemActionNode extends ProjectNode {
  override get family(): ProjectNodeFamily { return 'system-action' }
}

/** Any Project Node 的语义模型。 */
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
