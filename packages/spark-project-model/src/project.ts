/**
 * @spark-view/spark-project-model/project
 *
 * Project editing subpath. Keeps implementation exports off the root contract
 * for consumers that need the full editor surface.
 */

export {
  ProjectEditor,
  createProjectEditor,
} from './service/editor/project-editor.service'

export type {
  CreateProjectEditorOptions,
  ProjectEditorLoadOptions,
  ProjectModelDto,
  ProjectEditorSnapshot,
} from './service/editor/project-editor.service'

export {
  ProjectModel,
} from './entity/project/project.entity'

export type {
  ProjectModelLike,
  ProjectModelOptions,
} from './entity/project/project.entity'

export {
  ProjectNodeCollection,
} from './entity/project/node-collection.entity'

export {
  ProjectNode,
  ModuleNode,
  PageNode,
  ConfigPageNode,
  VuePageNode,
  ActionNode,
  LinkNode,
  RefNode,
  createProjectNodeModel,
  isConfigNodeKind,
  isProjectConfigPageNodeModel,
  isProjectModuleNodeModel,
  isProjectPageNodeModel,
} from './entity/node/node-factory'

export type {
  ConfigPageContentPart,
  PageNodeLike,
  PageNodeLoadOptions,
  PageNodeNavigationConfig,
  PageNodeRenderConfig,
  ProjectConfigPageDirtyPart,
  ProjectNavigationFlatNode,
  ProjectNodeDirtyPart,
  ProjectNodeFamily,
  ProjectPageNodeSummary,
  ProjectDescriptionContext,
} from './entity/node/node-factory'

export {
  PageNodeFactory,
  createPageNode,
  createPageNodeFactory,
} from './factory/page-node.factory'

export type {
  PageNodeFactoryLike,
  PageNodeFactoryOptions,
  PageNodeFileStorage,
} from './factory/page-node.factory'

export {
  PAGE_NODE_FILE_NAMES,
} from './service/file/file-registry.service'

export type {
  PageNodeFileName,
} from './service/file/file-registry.service'

export type {
  PageNodeFileVersionSummary,
} from './service/file/file-api.service'

export {
  ProjectNodeTools,
} from './service/navigation/tools.service'

export type {
  ProjectPageReference,
  ProjectSummary,
} from './service/reference/reference-client.service'

export type {
  NavigationNodeAddRequestDto,
  NavigationNodeEditDto,
  NavigationNodeEditPatchDto,
  NavigationNodeMoveRequestDto,
} from './service/navigation/editing.service'

export type {
  PageDesignEditHost,
} from './contract/edit-host.contract'

export {
  PAGE_DATA_JSON_SCHEMA,
  buildDataSetMetadataFromDesignerProjection,
  canUseStructuredPageDataEditor,
  hasDesignerProjectionChanges,
  projectDesignerRelations,
  projectDesignerTables,
  reconcileDesignerTableUiState,
} from './artifact/data.artifact'

export {
  componentCatalog,
  createRuleJsonSchema,
  createRuleTreePolicy,
} from './artifact/rule.artifact'

export type {
  DesignerRelationProjection,
  DesignerTableUiState,
  DesignerTableProjection,
} from './artifact/data.artifact'

export type {
  RuleEditorComponentCatalog,
} from './artifact/rule.artifact'
