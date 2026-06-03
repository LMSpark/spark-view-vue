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
  ProjectEditorSnapshot,
} from './service/editor/project-editor.service'

export type { ProjectModelDto } from './entity/project/project.entity'

export {
  ProjectModel,
} from './entity/project/project.entity'

export type {
  ProjectModelOptions,
  ProjectInfo,
  ProjectInfoInput,
} from './entity/project/project.entity'

export {
  ProjectNode,
} from './entity/node/node-base.entity'

export {
  ConfigPageNode,
} from './entity/node/config-page.entity'

export {
  isConfigNodeKind,
  findPageNodeByPageId,
  findNodeById,
  findNodeLocation,
  findConfigNodeByPageId,
  isSystemRootDirectory,
  canUseModuleNodeKind,
  resolvePageNodePageId,
  normalizePageIdFromPath,
  createRootModuleNode,
  createReservedRootGroup,
} from './entity/node/node-helpers'

export type {
  PageNodeLike,
  PageNodeLoadOptions,
  PageNodeRenderConfig,
} from './entity/node/config-page.entity'

export type {
  ProjectNodeLocation,
} from './entity/node/node-base.entity'

export type {
  ProjectNodeFamily,
  ProjectPageNodeSummary,
  ProjectDescriptionContext,
} from './entity/node/node-base.entity'

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
} from './entity/node/page-file-types'

export type {
  PageNodeFileName,
} from './entity/node/page-file-types'

export type {
  PageNodeFileVersionSummary,
} from './entity/node/page-file-types'

export type {
  ProjectPageReference,
  ProjectSummary,
} from './service/reference/reference-client.service'

export type {
  NavigationNodeEditDto,
  NavigationNodeEditPatchDto,
} from './entity/navigation/edit.entity'

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
