// capabilities barrel — 页面四文件编辑能力层公共入口

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
} from './json-document'

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
} from './json-document'

// page-file-document
export {
  PAGE_FILE_NAMES,
  canonicalizeDataSetMetadata,
  canonicalizePageDataJson,
  canonicalizePageDataValue,
  createPageDocuments,
  createPageDocumentsFromRegistry,
  forEachDocument,
  forEachDynamicDocument,
  isPageFileDocumentDirty,
  PageConfigComputedValue,
  PageConfigDocumentChangeNotifier,
  PageConfigValueRef,
  PageFileDocument,
} from './page-file-document'

export type {
  DynamicPageFileDocument,
  LoadFromTextOptions,
  PageDocumentRegistry,
  PageFileDocumentListener,
  PageFileLoadState,
  PageFileName,
} from './page-file-document'

// page-edit-session
export {
  isPageDesignServiceResult,
  PageConfigEditWorkspace,
  PageConfigFileLifecycle,
  PageDesignEditSession,
  PageDesignService,
  pageDesignServiceFailure,
  pageDesignServiceSuccess,
  registerPageDesignEditHost,
  resolvePageDesignEditHost,
  resolvePageDesignEditPageId,
} from './page-edit-session'

export type {
  CreateMountedPageParams,
  CreateMountedPageResult,
  PageConfigEditWorkspaceOptions,
  PageConfigFileLifecycleOptions,
  PageDesignEditHost,
  PageDesignEditHostSnapshot,
  PageDesignEditPhase,
  PageDesignFlowDescription,
  PageDesignFlowQuery,
  PageDesignNodeTree,
  PageDesignServiceActionBinding,
  PageDesignServiceContext,
  PageDesignServiceOptions,
  PageDesignServiceResult,
  PageDesignTextFileKey,
  PageNavigationMountParams,
  RemoveMountedPageParams,
  RemoveMountedPageResult,
  SparkNodeTreeMethodKey,
} from './page-edit-session'

// page-design-artifacts
export {
  buildDataSetMetadataFromDesignerProjection,
  canUseStructuredPageDataEditor,
  createRuleEditorComponentMetadata,
  createRuleJsonSchema,
  createRuleTreePolicy,
  EMPTY_RULE_EDITOR_COMPONENT_METADATA,
  getNextPageDesignFlowStep,
  getPageDesignFlowStep,
  hasDesignerProjectionChanges,
  listPageDesignFlowSteps,
  PAGE_DATA_JSON_SCHEMA,
  PAGE_DESIGN_100_STEP_FLOW,
  projectDesignerRelations,
  projectDesignerTables,
  reconcileDesignerTableUiState,
  summarizePageDesignFlowPhases,
} from './page-design-artifacts'

export type {
  DesignerColumnProjection,
  DesignerRelationProjection,
  DesignerTableProjection,
  DesignerTableUiState,
  PageDataEditorMode,
  PageDesignFlowPhaseSummary,
  PageDesignFlowStep,
  RuleEditorComponentCatalog,
  RuleEditorComponentCatalogEntry,
  RuleEditorComponentCatalogProp,
  RuleEditorComponentMetadata,
  RuleEditorComponentMetadataSource,
} from './page-design-artifacts'
