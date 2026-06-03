/**
 * @spark-view/spark-project-model/project
 *
 * Project editing subpath. Keeps implementation exports off the root contract
 * for consumers that need the full editor surface.
 */

// ── Core types (re-exported for editor-surface consumers) ──────────────────

export {
  isConfigNodeKind,
  findNodeById,
  findNodeLocation,
  findPageNodeByPageId,
  isSystemRootDirectory,
  canUseModuleNodeKind,
  resolvePageNodePageId,
  normalizePageIdFromPath,
  createRootModuleNode,
  createReservedRootGroup,
} from './core/node-helpers'

export type {
  ProjectNodeLocation,
  ProjectPageNodeSummary,
} from './core/node'

export type {
  NavigationNodeEditDto,
  NavigationNodeEditPatchDto,
  NavigationNodeEditApplyResultDto,
  NavigationNodeEditInputDto,
} from './core/navigation-edit'

export {
  PAGE_NODE_FILE_NAMES,
} from './core/page-file'

export type {
  PageNodeFileName,
  PageNodeFileVersionSummary,
} from './core/page-file'

export {
  ConfigPageNode,
} from './core/config-page'

export type {
  PageNodeLike,
} from './core/config-page'

// ── Editor ────────────────────────────────────────────────────────────────

export {
  ProjectEditor,
  createProjectEditor,
} from './editor/editor'

export type {
  CreateProjectEditorOptions,
  ProjectEditorLoadOptions,
  ProjectEditorSnapshot,
} from './editor/editor'

export type {
  ProjectPageReference,
  ProjectSummary,
} from './infra/reference'

export {
  PAGE_DATA_JSON_SCHEMA,
  buildDataSetMetadataFromDesignerProjection,
  canUseStructuredPageDataEditor,
  hasDesignerProjectionChanges,
  projectDesignerRelations,
  projectDesignerTables,
  reconcileDesignerTableUiState,
} from './design/data'

export {
  componentCatalog,
  createRuleJsonSchema,
  createRuleTreePolicy,
} from './design/rule'

export type {
  DesignerRelationProjection,
  DesignerTableUiState,
  DesignerTableProjection,
} from './design/data'

export type {
  RuleEditorComponentCatalog,
} from './design/rule'
