/**
 * @spark-view/spark-project-model
 *
 * 统一项目树模型——以项目为中心。
 * 编辑即 CRUD，描述即需求，项目即模块节点。
 */

// ── 核心 ──────────────────────────────────────────────

export { ProjectModel } from './core/project'
export type { ProjectModelOptions } from './core/project'
export type { ProjectModelDto } from './core/project'
export type { ProjectInfo, ProjectInfoInput } from './core/project'

// ── 节点 ──────────────────────────────────────────────

export {
  ProjectNode,
  isProjectNodeData,
} from './core/node'

export {
  ConfigPageNode,
} from './core/config-page'

export {
  isConfigNodeKind,
  resolvePageNodePageId,
  readProjectNodeDescription,
  flattenProjectNavigationRoot,
  buildProjectNavigationTree,
  findPageNodeByPageId,
  findNodeById,
  findNodeLocation,
  findConfigNodeByPageId,
  isSystemRootDirectory,
  canUseModuleNodeKind,
  normalizePageIdFromPath,
  createRootModuleNode,
  createReservedRootGroup,
} from './core/node-helpers'

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
} from './core/node'

export type {
  PageNodeLoadOptions,
  PageNodeRenderConfig,
  PageNodeLike,
} from './core/config-page'

// ── 导航 DTO（契约层）─────────────────────────────

export type {
  NavigationNodeEditDto,
  NavigationNodeEditPatchDto,
} from './core/navigation-edit'

// ── 页面文件 ──────────────────────────────────────────

export {
  PAGE_NODE_FILE_NAMES,
} from './core/page-file'

export type {
  PageNodeFileName,
  PageNodeFileVersionSummary,
} from './core/page-file'

// ── 工厂 ──────────────────────────────────────────────

export {
  PageNodeFactory,
  createPageNode,
  createPageNodeFactory,
} from './editor/factory'

export type {
  PageNodeFactoryLike,
  PageNodeFactoryOptions,
  PageNodeFileStorage,
} from './editor/factory'
