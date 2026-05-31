/**
 * 项目节点模型——barrel 入口。
 *
 * base.ts       → ProjectNode, PageNode
 * module.ts     → ModuleNode
 * config-page/  → ConfigPageNode + content
 * vue-page.ts   → VuePageNode
 * action.ts     → ActionNode
 * link.ts       → LinkNode
 * ref.ts        → RefNode
 * helpers.ts    → 纯函数
 */

export { ProjectNode, PageNode } from './base'
export type { ProjectNodeModelOptions, ProjectNodeDirtyPart } from './base'
export type { ProjectConfigPageNodeModelOptions, ConfigPageContentPart, ProjectConfigPageDirtyPart } from './base'

export { ModuleNode } from './module'

export {
  ConfigPageNode,
} from './config-page/config-page'

export { VuePageNode } from './vue-page'
export { ActionNode } from './action'
export { LinkNode } from './link'
export { RefNode } from './ref'

export type { ProjectNavigationFlatNode } from './helpers'

export {
  isConfigNodeKind,
  isProjectPageNodeKind,
  isProjectModuleNodeKind,
  readProjectPlanningNodeKind,
  canProjectNodeContainChild,
  readAllowedProjectPlanningChildKinds,
  normalizeConfigPageId,
  resolvePageIdFromProjectPath,
  resolvePageNodePageId,
  readProjectNodeRequirement,
  createProjectRequirementConstraint,
  appendProjectRequirementConstraint,
  formatProjectRequirementConstraints,
  flattenProjectNavigationRoot,
  buildProjectNavigationTree,
  projectNavNodeToFlatRow,
  optionalText,
} from './helpers'

// 工厂函数和类型守卫（依赖具体子类）
import { ConfigPageNode } from './config-page/config-page'
import { VuePageNode } from './vue-page'
import { ActionNode } from './action'
import { LinkNode } from './link'
import { RefNode } from './ref'
import { ModuleNode } from './module'
import type { ProjectNode, PageNode } from './base'
import { isConfigNodeKind } from './helpers'
import type { ProjectConfigPageNodeModelOptions } from './base'

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

// 重导出类型别名（向后兼容）
export type { PageNodeLike } from '../../contract/node'
export type { PageNodeRenderConfig } from '../../contract/node'
export type { ProjectPageNodeSummary } from '../../contract/node'
export type { ProjectNodeFamily, ProjectPlanningNodeKind, ProjectPagePlanningNodeKind, ProjectPlanningParentKind, ProjectRequirementConstraint, PageNodeLoadOptions, PageNodeNavigationConfig } from '../../contract/node'
