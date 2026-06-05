/**
 * @spark-appworks/spark-project-model
 *
 * 领域模型入口（model/）：class 层级为主语。
 * 设计门面（facade/）：见 `@spark-appworks/spark-project-model/project`。
 * 存储适配（io/）：包内专用，勿跨包 import。
 */

// ── 项目根 ────────────────────────────────────────────────────

export { ProjectModel } from './model/project/model'
export { ProjectDesign, NavigationDesign } from './model/project/design'
export { ProjectRuntime } from './model/project/runtime'
export type { ProjectModelOptions, ProjectModelDto, ProjectInfo, ProjectInfoInput } from './model/project/types'

// ── 导航节点 ────────────────────────────────────────────────

export {
  ModuleNode,
  SystemDirectoryNode,
  LinkNode,
  RefNode,
  SystemPageNode,
  VueComponentPageNode,
  SystemActionNode,
} from './model/navigation/kinds'
export {
  createProjectNodeModel,
  isConfigPageNode,
  isConfigSubPageNode,
} from './model/navigation/factory'

export {
  ProjectNode,
  isProjectNodeData,
} from './model/navigation/node'

export {
  isConfigNodeKind,
  isConfigFilesPageSurface,
  resolvePageDesignSurface,
  resolveNavPageSummaryId,
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
  ProjectNodeFamily,
  ProjectDescriptionContext,
  PageDesignSurface,
  ProjectPageNodeSummary,
  RegionItems,
  RegionVisibility,
} from './model/navigation/node'

// ── 配置页 ──────────────────────────────────────────────────

export { PageDesign } from './model/page/design'
export { PageRuntime } from './model/page/runtime'

export { ConfigPageNode } from './model/page/config-page'
export { ConfigSubPageNode } from './model/page/config-sub-page'

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

export {
  PageNodeFactory,
  createPageNode,
  createPageNodeFactory,
} from './factory/page-node-factory'

export type {
  PageNodeFactoryLike,
  PageNodeFactoryOptions,
  PageNodeFileStorage,
} from './factory/page-node-factory'
