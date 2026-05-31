/**
 * @spark-view/spark-project-model
 *
 * 统一项目树模型——以项目为中心。
 * 编辑即 plan，描述即需求，项目即模块节点。
 */

// ── 核心 ──────────────────────────────────────────────

export { ProjectModel } from './entity/project'
export type { ProjectModelLike } from './entity/project'
export type { ProjectModelOptions } from './contract/node'

export {
  ProjectEditor,
  createProjectEditor,
} from './service/editor/project-editor'

export type {
  CreateProjectEditorOptions,
  ProjectEditorLoadOptions,
  ProjectEditorSnapshot,
} from './service/editor/project-editor'

// ── 节点 ──────────────────────────────────────────────

export { ProjectNodeCollection } from './entity/project-node-collection'

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
  isProjectConfigPageNodeModel,
  isProjectModuleNodeModel,
  isProjectPageNodeModel,
  isConfigNodeKind,
  resolvePageNodePageId,
  readProjectNodeRequirement,
  flattenProjectNavigationRoot,
  buildProjectNavigationTree,
} from './entity/node/project-node-model'

export type {
  ProjectNodeFamily,
  ProjectRequirementConstraint,
  PageNodeLoadOptions,
  PageNodeNavigationConfig,
  PageNodeRenderConfig,
  ProjectPageNodeSummary,
  ProjectNodeDirtyPart,
  ConfigPageContentPart,
  ProjectConfigPageDirtyPart,
  ProjectNavigationFlatNode,
} from './entity/node/project-node-model'

// ── 导航 ──────────────────────────────────────────────

export type { NavigationNodeDraft } from './service/navigation/editing'
export type { NavDraft, NavNode, NavNodeKind } from './contract/navigation'

// ── 文件 ──────────────────────────────────────────────

export { PAGE_NODE_FILE_NAMES } from './service/file/page-file-registry'
export type { PageNodeFileName } from './service/file/page-file-registry'
export type { PageNodeFileVersionSummary } from './service/file/page-file-api'

// ── 工厂 ──────────────────────────────────────────────

export {
  PageNodeFactory,
  createPageNode,
  createPageNodeFactory,
} from './entity/node/page-node-factory'

export type {
  PageNodeFactoryLike,
  PageNodeFactoryOptions,
  PageNodeFileStorage,
} from './entity/node/page-node-factory'

// ── 工件 ──────────────────────────────────────────────

export {
  PAGE_DATA_JSON_SCHEMA,
  buildDataSetMetadataFromDesignerProjection,
  canUseStructuredPageDataEditor,
  projectDesignerTables,
  projectDesignerRelations,
  reconcileDesignerTableUiState,
} from './service/editor/data-artifacts'

export {
  createRuleJsonSchema,
  createRuleTreePolicy,
} from './service/editor/rule-artifacts'

export type {
  DesignerTableProjection,
  DesignerRelationProjection,
} from './service/editor/data-artifacts'

export type {
  RuleEditorComponentCatalog,
} from './service/editor/rule-artifacts'

// ── 工具 ──────────────────────────────────────────────

export { ProjectNodeTools } from './service/navigation/project-node-tools'

// ── 编辑宿主 ──────────────────────────────────────────

export type { PageDesignEditHost } from './contract/edit-host'

// ── 契约 ──────────────────────────────────────────────

export type { PageNodeLike } from './entity/node/project-node-model'
export type { NodeFamily, PageRenderConfig, PageSummary } from './contract/node'
