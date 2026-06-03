/**
 * @spark-view/spark-project-model
 *
 * 统一项目树模型——以项目为中心。
 * 编辑即 CRUD，描述即需求，项目即模块节点。
 */

// ── 核心 ──────────────────────────────────────────────

export { ProjectModel } from './entity/project/project.entity'
export type { ProjectModelOptions } from './entity/project/project.entity'
export type { ProjectModelDto } from './entity/project/project.entity'
export type { ProjectInfo, ProjectInfoInput } from './entity/project/project.entity'

// ── 节点 ──────────────────────────────────────────────

export {
  ProjectNode,
  ModuleNode,
  ConfigPageNode,
  VuePageNode,
  ActionNode,
  LinkNode,
  RefNode,
  createProjectNodeModel,
  isProjectConfigPageNodeModel,
  isConfigNodeKind,
  resolvePageNodePageId,
  readProjectNodeDescription,
  flattenProjectNavigationRoot,
  buildProjectNavigationTree,
  isProjectNodeData,
} from './entity/node/node-factory'

export type {
  ProjectModelData,
  ChildPlacement,
  NavContextItem,
  NavContextState,
  NavNodeKind,
  NavPermissionMode,
  ProjectNodeData,
  ProjectNodeFamily,
  ProjectDescriptionContext,
  PageNodeLoadOptions,
  PageNodeNavigationConfig,
  PageNodeRenderConfig,
  ProjectPageNodeSummary,
  ConfigPageDirtyPart,
  RegionItems,
  RegionVisibility,
} from './entity/node/node-factory'

// ── 导航 DTO（契约层）─────────────────────────────

export type {
  NavigationNodeAddRequestDto,
  NavigationNodeEditDto,
  NavigationNodeEditPatchDto,
  NavigationNodeMoveRequestDto,
  ProjectNodeLocation,
} from './entity/navigation/edit.entity'

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
export type { PageDesignEditHost, PageDesignEditPhase, PageDesignNodeTree } from './entity/project/edit-host.entity'

// ── 契约 ──────────────────────────────────────────────

export type { PageNodeLike } from './entity/node/node-factory'
