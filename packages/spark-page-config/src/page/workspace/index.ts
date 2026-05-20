export type {
  PageConfigCreatePageParams,
  PageConfigFileApiOptions,
  PageConfigFileVersionSummary,
  PageConfigPageSummary,
} from '../loading/page-config-file-api'

export {
  PageConfigFileApi,
} from '../loading/page-config-file-api'

export {
  addChildNode,
  addSiblingNode,
  applyAutoPopulatePatches,
  buildJsonTreeRows,
  buildTreeModel,
  deleteNode,
  ensureUniqueObjectKey,
  exportJsonDocument,
  filterTreeNodes,
  flattenJsonDocumentForEdit,
  formatJsonPath,
  formatValuePreview,
  getNodePath,
  getValueAtJsonPath,
  isJsonObject,
  normalizeJsonDocument,
  parseJsonDocument,
  renameNodeKey,
  resolveSchemaInfoForPath,
  restoreJsonDocumentByOriginalType,
  restoreJsonDocumentFromFlat,
  rootOf,
  serializeJsonDocument,
  toDisplayRows,
  updateNodeType,
  updateNodeValue,
} from './documents/json-document'

export type {
  AutoPopulateEntry,
  FlatJsonTreeDocument,
  JsonDocument,
  JsonNodeType,
  JsonObject,
  JsonPath,
  JsonSchemaInfo,
  JsonTreePolicy,
  JsonValue,
  MutationResult,
  TreeDisplayNode,
  TreeModel,
  TreeNode,
} from './documents/json-document'

export {
  PAGE_FILE_NAMES,
  canonicalizePageDataJson,
  canonicalizePageDataValue,
  createPageDocuments,
  createPageDocumentsFromRegistry,
  forEachDocument,
  forEachDynamicDocument,
  isPageFileDocumentDirty,
} from './documents/page-file-documents'

export type {
  LoadFromTextOptions,
  DynamicPageFileDocument,
  PageDocumentRegistry,
  PageFileDocument,
  PageFileLoadState,
  PageFileName,
} from './documents/page-file-documents'

export {
  PageConfigEditWorkspace,
} from './editing/page-config-edit-workspace'

export type {
  PageConfigEditWorkspaceOptions,
} from './editing/page-config-edit-workspace'

export {
  registerPageDesignEditHost,
  resolvePageDesignEditHost,
  resolvePageDesignEditPageId,
} from './editing/page-design-edit-host-registry'

export type {
  PageDesignEditHostSnapshot,
} from './editing/page-design-edit-host-registry'

export {
  PageDesignEditSession,
} from './editing/page-design-edit-session'

export type {
  PageDesignEditPhase,
  PageDesignEditHost,
} from './editing/page-design-edit-session'

export type {
  PageDesignNodeTree,
  SparkNodeTreeMethodKey,
} from './editing/page-design-node-tree'

export {
  EMPTY_RULE_EDITOR_COMPONENT_METADATA,
} from './design/rule-editor-metadata'

export type {
  RuleEditorComponentMetadata,
} from './design/rule-editor-metadata'

export {
  createRuleTreePolicy,
} from './design/rule-tree-policy'

export {
  createRuleJsonSchema,
} from './design/rule-json-schema'

export {
  PAGE_DATA_JSON_SCHEMA,
  canUseStructuredPageDataEditor,
} from './design/page-data-json-schema'

export type {
  PageDataEditorMode,
} from './design/page-data-json-schema'

export {
  buildDataSetMetadataFromDesignerProjection,
  hasDesignerProjectionChanges,
  projectDesignerRelations,
  projectDesignerTables,
  reconcileDesignerTableUiState,
} from './design/page-design-designer-projection'

export {
  PAGE_DESIGN_100_STEP_FLOW,
  getNextPageDesignFlowStep,
  getPageDesignFlowStep,
  listPageDesignFlowSteps,
  summarizePageDesignFlowPhases,
} from './design/page-design-100-step-flow'

export type {
  PageDesignFlowPhaseSummary,
  PageDesignFlowStep,
} from './design/page-design-100-step-flow'

export type {
  DesignerColumnProjection,
  DesignerRelationProjection,
  DesignerTableProjection,
  DesignerTableUiState,
} from './design/page-design-designer-projection'

export {
  PageDesignService,
  isPageDesignServiceResult,
  pageDesignServiceFailure,
} from './services/page-design-service'

export type {
  PageDesignFlowDescription,
  PageDesignFlowQuery,
  PageDesignServiceMethodBinding,
  PageDesignServiceContext,
  PageDesignServiceOptions,
  PageDesignServiceResult,
  PageDesignTextFileKey,
} from './services/page-design-service'

// 配置加载器
export {
  PageConfigLoader,
  createConfigLoader,
  compileRule,
  normalizeRuleNode,
  parsePageData,
  parseScript,
  parseCss,
} from '../loading/page-config-loader'

export {
  PageConfigFileLifecycle,
} from './lifecycle/page-config-file-lifecycle'

export type {
  CreateMountedPageParams,
  CreateMountedPageResult,
  PageConfigFileLifecycleOptions,
  PageNavigationMountParams,
  RemoveMountedPageParams,
  RemoveMountedPageResult,
} from './lifecycle/page-config-file-lifecycle'
