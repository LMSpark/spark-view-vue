/**
 * @module app:views/app/dev-system/project-model-dev-bindings
 * app 的 views/app/dev-system/project-model-dev-bindings 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
export {
  isConfigFilesPageSurface,
  isConfigNodeKind,
  findNodeById,
  findPageNodeByPageId,
  findNodeLocation,
  isSystemRootDirectory,
  canUseModuleNodeKind,
  resolvePageNodePageId,
  normalizePageIdFromPath,
  PAGE_NODE_FILE_NAMES,
} from '@spark-appworks/spark-project-model'

export type {
  ProjectModel,
  ProjectNodeLocation,
  PageNodeFileName,
  ProjectPageNodeSummary,
  NavigationNodeDraft,
  NavigationNodeDraftNode,
  ProjectWorkspace,
  ProjectPageReference,
  ProjectSummary,
} from '@spark-appworks/spark-project-model'
