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

export { ProjectModel } from './project/model'
export type { ProjectModelOptions } from './project/model'
export type { ProjectModelDto } from './project/model'
export type { ProjectInfo, ProjectInfoInput } from './project/model'

// ── L1 导航节点 ──────────────────────────────────────────────

export {
  ProjectNode,
  isProjectNodeData,
} from './navigation/node'

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
} from './navigation/helpers'

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
} from './navigation/node'

// ── L2 页面设计 ──────────────────────────────────────────────

export {
  ConfigPageNode,
} from './page/config-page'

export type {
  PageNodeLoadOptions,
  PageNodeRenderConfig,
  PageNodeLike,
} from './page/config-page'

export {
  PAGE_NODE_FILE_NAMES,
} from './page/file'

export type {
  PageNodeFileName,
  PageNodeFileVersionSummary,
} from './page/file'

// ── 工厂 ──────────────────────────────────────────────────────

export {
  PageNodeFactory,
  createPageNode,
  createPageNodeFactory,
} from './page/factory'

export type {
  PageNodeFactoryLike,
  PageNodeFactoryOptions,
  PageNodeFileStorage,
} from './page/factory'
