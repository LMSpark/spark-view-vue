/**
 * @spark-appworks/spark-project-model/project
 *
 * Project editing subpath — L3 编辑器层 + 设计制品。
 * 消费者需同时从 root 入口导入 L1/L2 领域类型。
 */

// ── L3 导航编辑 DTO ──────────────────────────────────────────

export type {
  NavigationNodeEditDto,
  NavigationNodeEditPatchDto,
  NavigationNodeEditApplyResultDto,
  NavigationNodeEditInputDto,
} from './navigation/edit'

// ── L3 编辑器 ────────────────────────────────────────────────

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
} from './infra/reference/client'

// ── 设计制品 ─────────────────────────────────────────────────

export {
  PAGE_DATA_JSON_SCHEMA,
  buildDataSetMetadataFromDesignerProjection,
  canUseStructuredPageDataEditor,
  hasDesignerProjectionChanges,
  projectDesignerRelations,
  projectDesignerTables,
  reconcileDesignerTableUiState,
} from './editor/artifacts/page-data'

export {
  componentCatalog,
  createRuleJsonSchema,
  createRuleTreePolicy,
} from './editor/artifacts/rule'

export type {
  DesignerRelationProjection,
  DesignerTableUiState,
  DesignerTableProjection,
} from './editor/artifacts/page-data'

export type {
  RuleEditorComponentCatalog,
} from './editor/artifacts/rule'
