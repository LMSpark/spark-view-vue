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
  isProjectNodeData,
} from './entity/node/node-base.entity'

export {
  ConfigPageNode,
} from './entity/node/config-page.entity'

export {
  isConfigNodeKind,
  resolvePageNodePageId,
  readProjectNodeDescription,
  flattenProjectNavigationRoot,
  buildProjectNavigationTree,
} from './entity/node/node-helpers'

export type {
  ProjectModelData,
  ChildPlacement,
  NavContextItem,
  NavContextState,
  NavNodeKind,
  NavPermissionMode,
  ProjectNodeData,
  ProjectNodeLocation,
  ProjectNodeFamily,
  ProjectDescriptionContext,
  ProjectPageNodeSummary,
  RegionItems,
  RegionVisibility,
} from './entity/node/node-base.entity'

export type {
  PageNodeLoadOptions,
  PageNodeRenderConfig,
} from './entity/node/config-page.entity'

// ── 导航 DTO（契约层）─────────────────────────────

export type {
  NavigationNodeEditDto,
  NavigationNodeEditPatchDto,
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

// ── 契约 ──────────────────────────────────────────────

export type { PageNodeLike } from './entity/node/config-page.entity'
