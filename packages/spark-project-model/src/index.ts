/**
 * @spark-appworks/spark-project-model
 *
 * 统一项目树模型——以项目为中心。
 * 编辑即 CRUD，描述即需求，项目即模块节点。
 *
 * 本入口导出 L1（项目模型）+ L2（页面设计）的纯领域符号。
 * 编辑器层（L3）符号从 ./project 子路径导出。
 */

// ── L1 项目模型 ──────────────────────────────────────────────

export { ProjectModel } from './core/project'
export type { ProjectModelOptions } from './core/project'
export type { ProjectModelDto } from './core/project'
export type { ProjectInfo, ProjectInfoInput } from './core/project'

// ── L1 导航节点 ──────────────────────────────────────────────

export {
  ProjectNode,
  isProjectNodeData,
} from './core/node'

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

// ── L2 页面设计 ──────────────────────────────────────────────

export {
  ConfigPageNode,
} from './core/config-page'

export type {
  PageNodeLoadOptions,
  PageNodeRenderConfig,
  PageNodeLike,
} from './core/config-page'

export {
  PAGE_NODE_FILE_NAMES,
} from './core/page-file'

export type {
  PageNodeFileName,
  PageNodeFileVersionSummary,
} from './core/page-file'

// ── 工厂 ──────────────────────────────────────────────────────

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
