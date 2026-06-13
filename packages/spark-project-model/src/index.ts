/**
 * @module @spark-appworks/spark-project-model:index
 * 职责：提供项目模型和页面配置域中的 index 能力，支撑 navigation、page content、project session 或远程 IO。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */
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
  ProjectPlanningInput,
  ProjectPlanningCompletionInput,
  ProjectPlanningCompletionResult,
  NavigationPlanningInput,
} from './project/project-types'
export type {
  ProjectWorkspaceOptions,
  ProjectPageLoadOptions,
} from './project/project-workspace'
export type {
  ProjectPageReference,
  ProjectSummary,
} from './io/project-reference-client'
export {
  applyNestedConfigPagePresetToDraft,
} from './navigation/navigation-edit'
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
  isNestedConfigPageNode,
  resolvePageNodePageId,
  findPageNodeByPageId,
  findNodeById,
  findNodeLocation,
  isSystemRootDirectory,
  canUseModuleNodeKind,
  normalizePageIdFromPath,
  normalizeNavRoot,
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
} from './page/compile-files'

export {
  canonicalizePageDataJson,
  canonicalizePageDataValue,
} from './page/canonicalize-page-data'
