/**
 * @spark-appworks/spark-project-model
 *
 * 领域模型（model/）：class 层级为主语。
 * 运行态页面加载也从根入口导出；ProjectWorkspace 见 `@spark-appworks/spark-project-model/project`。
 */

// ── 项目根 ────────────────────────────────────────────────────

export { ProjectModel } from './model/project/model'
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
} from './model/project/types'
export type {
  NavigationNodeDraftNode,
  NavigationNodePatch,
  NavigationNodeDraftApplyResult,
  NavigationNodeDraft,
} from './model/navigation/edit'

// ── 导航节点与 DTO ──────────────────────────────────────────

export {
  isProjectNodeData,
} from './model/navigation/node'

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
} from './model/navigation/helpers'

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
} from './model/navigation/node'

// ── 配置页 ──────────────────────────────────────────────────

export type {
  PageNodeLoadOptions,
  PageNodeRenderConfig,
  PageNodeLike,
} from './model/page/config-page'

export { PAGE_NODE_FILE_NAMES } from './model/page/file'

export type {
  PageNodeFileName,
  PageNodeFileVersionSummary,
} from './model/page/file'

export { PageContentLoader } from './io/page-content-loader'
export type { PageContentLoaderOptions } from './io/page-content-loader'
export { createRuntimePageNode } from './io/runtime-page'

export {
  compileRule,
  normalizeRuleNode,
  parsePageData,
  parseScript,
  parseCss,
} from './model/serialization/compiler'

export {
  canonicalizePageDataJson,
  canonicalizePageDataValue,
  canonicalizeDataSetMetadata,
} from './model/serialization/page-data'
