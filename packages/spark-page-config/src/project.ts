/**
 * @spark-view/spark-page-config/project
 *
 * 项目级编辑入口：DevSystem 等设计时 UI 通过这里编辑项目平铺节点集合和配置页节点。
 */

export {
  ProjectEditor,
  createProjectEditor,
} from './project/project-editor'

export {
  ProjectModel,
} from './project/project-model'

export {
  ProjectNodeCollection,
} from './project/project-node-collection'

export {
  ProjectPlanningModel,
} from './project/project-planning-model'

export {
  ProjectReferenceClient,
} from './project/project-reference-client'

export type {
  CreateProjectEditorOptions,
  ProjectEditorLoadOptions,
  ProjectEditorSnapshot,
} from './project/project-editor'

export type {
  ProjectModelLike,
  ProjectModelOptions,
} from './project/project-model'

export type {
  ProjectPlanningModelOptions,
  ProjectModulePlan,
  ProjectPagePlan,
  ProjectPlanningSnapshot,
  ProjectPlannedNode,
} from './project/project-planning-model'

export type {
  ListProjectReferencesOptions,
  ProjectPageReference,
  ProjectReferenceClientOptions,
  ProjectSummary,
} from './project/project-reference-client'

export {
  PAGE_NODE_FILE_NAMES,
} from './page-model/model/page-file-registry'

export {
  ProjectNodeTools,
} from './project/project-node-tools'

export {
  buildDataSetMetadataFromDesignerProjection,
  canUseStructuredPageDataEditor,
  hasDesignerProjectionChanges,
  PAGE_DATA_JSON_SCHEMA,
  projectDesignerRelations,
  projectDesignerTables,
  reconcileDesignerTableUiState,
} from './page-model/update/artifacts/data-artifacts'

export type {
  DesignerColumnProjection,
  DesignerRelationProjection,
  DesignerTableProjection,
  DesignerTableUiState,
  PageDataEditorMode,
} from './page-model/update/artifacts/data-artifacts'

export {
  createRuleJsonSchema,
  createRuleTreePolicy,
} from './page-model/update/artifacts/rule-artifacts'

export type {
  RuleEditorComponentCatalog,
  RuleEditorComponentMetadata,
} from './page-model/update/artifacts/rule-artifacts'

export type {
  PageDesignEditHost,
} from './page-model/update/page-edit-session'

export type {
  PageNodeFileName,
} from './page-model/model/page-file-registry'

export type {
  NavigationNodeDraft,
} from './page-model/navigation/nav-editing'

export type {
  PageNodeFileVersionSummary,
} from './page-model/model/page-file-api'

export type {
  BuildProjectPageSummariesOptions,
  ProjectNodeDraft,
  ReadPlanningNodeOptions,
} from './project/project-node-tools'

export type {
  ConfigPageContentPart,
  PageNodeLike,
  PageNodeLoadOptions,
  PageNodeNavigationConfig,
  PageNodeRenderConfig,
  ProjectConfigPageDirtyPart,
  ProjectNodeModelOptions,
  ProjectNodeDirtyPart,
  ProjectConfigPageNodeModelOptions,
  ProjectNavigationFlatNode,
  ProjectNodeFamily,
  ProjectPageNodeSummary,
  ProjectPagePlanningNodeKind,
  ProjectPlanningNodeKind,
  ProjectPlanningParentKind,
  ProjectRequirementConstraint,
} from './project/project-node-model'

export type {
  ProjectNodeCollectionOptions,
} from './project/project-node-collection'

export {
  ProjectConfigPageNodeModel,
  ProjectLinkNodeModel,
  ProjectModuleNodeModel,
  ProjectNodeModel,
  ProjectRefNodeModel,
  ProjectSystemActionNodeModel,
  ProjectVuePageNodeModel,
  isConfigNodeKind,
  resolvePageNodePageId,
} from './project/project-node-model'

import componentCatalog from './page-model/ai/payloads/component-catalog.json'
export { componentCatalog }
