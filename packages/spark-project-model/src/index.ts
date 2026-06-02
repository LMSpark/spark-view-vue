/**
 * @spark-view/spark-project-model
 *
 * 统一项目树模型——以项目为中心。
 * 编辑即 CRUD，描述即需求，项目即模块节点。
 */

// ── 核心 ──────────────────────────────────────────────

export { ProjectModel } from './entity/project/project.entity'
export type { ProjectModelLike } from './entity/project/project.entity'
export type { ProjectModelOptions } from './entity/project/project.entity'
export type { ProjectModelDto } from './contract/project.contract'

// ── 节点 ──────────────────────────────────────────────

export { ProjectNodeCollection } from './entity/project/node-collection.entity'

export {
  ProjectNode,
  ModuleNode,
  PageNode,
  ConfigPageNode,
  VuePageNode,
  ActionNode,
  LinkNode,
  RefNode,
  createProjectNodeModel,
  isProjectConfigPageNodeModel,
  isProjectModuleNodeModel,
  isProjectPageNodeModel,
  isConfigNodeKind,
  resolvePageNodePageId,
  readProjectNodeDescription,
  flattenProjectNavigationRoot,
  buildProjectNavigationTree,
} from './entity/node/node-factory'

export type {
  ProjectNodeFamily,
  ProjectDescriptionContext,
  PageNodeLoadOptions,
  PageNodeNavigationConfig,
  PageNodeRenderConfig,
  ProjectPageNodeSummary,
  ProjectNodeDirtyPart,
  ConfigPageContentPart,
  ProjectConfigPageDirtyPart,
  ProjectNavigationFlatNode,
} from './entity/node/node-factory'

// ── 导航 ──────────────────────────────────────────────

export type {
  NavigationNodeAddRequestDto,
  NavigationNodeEditDto,
  NavigationNodeEditPatchDto,
  NavigationNodeMoveRequestDto,
  NavNode,
  NavNodeKind,
} from './contract/navigation.contract'

// ── 工厂 ──────────────────────────────────────────────

export {
  PageNodeFactory,
  createPageNode,
  createPageNodeFactory,
} from './factory/page-node.factory'

export type {
  PageNodeFactoryLike,
  PageNodeFactoryOptions,
  PageNodeFileStorage,
} from './factory/page-node.factory'

// ── 编辑宿主 ──────────────────────────────────────────


// ── 契约 ──────────────────────────────────────────────

export type { PageNodeLike } from './entity/node/node-factory'
