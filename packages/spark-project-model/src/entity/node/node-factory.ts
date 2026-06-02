/**
 * 项目节点模型——barrel 入口。
 *
 * base.ts       → ProjectNode, PageNode
 * module.ts     → ModuleNode
 * config-page   → ConfigPageNode
 * vue-page.ts   → VuePageNode
 * action.ts     → ActionNode
 * link.ts       → LinkNode
 * ref.ts        → RefNode
 * helpers.ts    → 纯函数
 */

export { ProjectNode } from './node-base.entity'
export { PageNode } from './page-node.entity'
export type {
  ChildPlacement,
  NavContextConfig,
  NavContextItem,
  NavContextState,
  NavNodeKind,
  NavPermissionMode,
  ProjectModelData,
  ProjectNodeData,
  ProjectNodeModelOptions,
  RegionItems,
  RegionVisibility,
} from './node-base.entity'
export type {
  ConfigPageDirtyPart,
  ProjectConfigPageNodeModelOptions,
} from './config-page.entity'
export { isProjectNodeData } from './node-base.entity'

export { ModuleNode } from './module-node.entity'

export {
  ConfigPageNode,
} from './config-page.entity'

export { VuePageNode } from './leaf-nodes.entity'
export { ActionNode } from './leaf-nodes.entity'
export { LinkNode } from './leaf-nodes.entity'
export { RefNode } from './leaf-nodes.entity'

export type { ProjectNavigationFlatNode } from './node-helpers'

export {
  isConfigNodeKind,
  isProjectPageNodeKind,
  isProjectModuleNodeKind,
  readProjectEditNodeKind,
  canProjectNodeContainChild,
  readAllowedProjectEditChildKinds,
  normalizeConfigPageId,
  resolvePageIdFromProjectPath,
  resolvePageNodePageId,
  readProjectNodeDescription,
  createProjectDescriptionContext,
  appendProjectDescriptionContext,
  formatProjectDescriptionContext,
  flattenProjectNavigationRoot,
  buildProjectNavigationTree,
  projectNavNodeToFlatRow,
  optionalText,
} from './node-helpers'

// 工厂函数和类型守卫（依赖具体子类）
import { ConfigPageNode } from './config-page.entity'
import { VuePageNode } from './leaf-nodes.entity'
import { ActionNode } from './leaf-nodes.entity'
import { LinkNode } from './leaf-nodes.entity'
import { RefNode } from './leaf-nodes.entity'
import { ModuleNode } from './module-node.entity'
import type { ProjectNode } from './node-base.entity'
import { PageNode } from './page-node.entity'
import { isConfigNodeKind } from './node-helpers'
import type { ProjectConfigPageNodeModelOptions } from './config-page.entity'

export function createProjectNodeModel(options: ProjectConfigPageNodeModelOptions): ProjectNode {
  const nodeKind = options.node.nodeKind ?? 'page'
  if (isConfigNodeKind(nodeKind)) return new ConfigPageNode(options)
  if (nodeKind === 'system-page') return new VuePageNode(options)
  if (nodeKind === 'system-action') return new ActionNode(options)
  if (nodeKind === 'link') return new LinkNode(options)
  if (nodeKind === 'ref') return new RefNode(options)
  return new ModuleNode(options)
}

export function isProjectConfigPageNodeModel(node: ProjectNode | null | undefined): node is ConfigPageNode { return node instanceof ConfigPageNode }
export function isProjectModuleNodeModel(node: ProjectNode | null | undefined): node is ModuleNode { return node instanceof ModuleNode }
export function isProjectPageNodeModel(node: ProjectNode | null | undefined): node is PageNode { return node instanceof PageNode }

export type {
  NodeKind,
  PageNodeFactoryLike,
  PageNodeFactoryOptions,
  PageNodeFileStorage,
  PageNodeLike,
  PageNodeLoadOptions,
  PageNodeNavigationConfig,
  PageNodeRenderConfig,
  ProjectDescriptionContext,
  ProjectEditNodeKind,
  ProjectEditParentKind,
  ProjectNodeFamily,
  ProjectPageEditNodeKind,
  ProjectPageNodeSummary,
} from './module-node.entity'
