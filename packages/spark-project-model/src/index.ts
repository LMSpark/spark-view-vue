/**
 * @spark-appworks/spark-project-model
 *
 * 领域模型：class 层级为主语。
 * 运行态页面加载与 ProjectWorkspace 均从根入口导出。
 */

// ── 项目根 ────────────────────────────────────────────────────

export { ProjectModel } from './project/project-model'
export { ProjectWorkspace } from './project/project-workspace'
export type {
  ProjectModelInitOptions,
  ProjectModelEvent,
  ProjectModelEventListener,
  ProjectActivePageProjection,
  ProjectDirtyProjection,
  ProjectNavigationProjection,
  ProjectNavigationDirtyScope,
  ProjectInfo,
  ProjectInfoInput,
} from './project/project-types'
export type {
  ProjectWorkspaceOptions,
  ProjectPageLoadOptions,
} from './project/project-workspace'
export type {
  ProjectPageReference,
  ProjectSummary,
} from './io/project-reference-client'
export type {
  NavigationNodeDraftNode,
  NavigationNodePatch,
  NavigationNodeDraftApplyResult,
  NavigationNodeDraft,
} from './navigation/navigation-edit'

// ── 导航节点与 DTO ──────────────────────────────────────────

export {
  isProjectNodeData,
} from './navigation/project-node'

export {
  isConfigNodeKind,
  isConfigFilesPageSurface,
  resolvePageNodePageId,
  findPageNodeByPageId,
  findNodeById,
  findNodeLocation,
  isSystemRootDirectory,
  canUseModuleNodeKind,
  normalizePageIdFromPath,
} from './navigation/navigation-tree'

export type {
  ProjectModelData,
  ChildPlacement,
  NavContextItem,
  NavContextState,
  NavNodeKind,
  NavPermissionMode,
  ProjectNodeData,
  ProjectNodeLocation,
  ProjectPageSurface,
  ProjectPageNodeSummary,
  RegionItems,
  RegionVisibility,
} from './navigation/project-node'

// ── 配置页 ──────────────────────────────────────────────────

export type {
  PageNodeLoadOptions,
  PageNodeRenderConfig,
  PageNodeLike,
} from './page/config-page'

export { PAGE_NODE_FILE_NAMES } from './page/page-file'

export type {
  PageNodeFileName,
  PageNodeFileVersionSummary,
} from './page/page-file'

export { PageContentLoader } from './io/page-content-loader'
export type { PageContentLoaderOptions } from './io/page-content-loader'
export { createRuntimePageNode } from './page/runtime-page'

export {
  compileRule,
  normalizeRuleNode,
  parsePageData,
  parseScript,
  parseCss,
} from './serialization/compiler'

export {
  canonicalizePageDataJson,
  canonicalizePageDataValue,
  canonicalizeDataSetMetadata,
} from './serialization/page-data'
