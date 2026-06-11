export type {
  AttributeMeta,
  ClassModel,
  ClassModelDocument,
  ConstructorMeta,
  JsDocMeta,
  MethodMeta,
  SourceProvenanceMeta,
} from './class-model'

export {
  AiApiObjectMetadataValidationError,
  collectNestedApiRecords,
  resolveModuleMetadataJson,
  validateApiObjectMetadata,
  walkAiApiMetadataGraph,
} from './metadata'

export type {
  AiApiActionAntiExample,
  AiApiActionExample,
  AiApiActionFailureMode,
  AiApiActionMetadata,
  AiApiAttributeMetadata,
  AiApiConstructorMetadata,
  AiApiJsDocMetadata,
  AiApiObjectMetadata,
  AiApiResultApiRef,
  AiApiSourceProvenanceMetadata,
  AiModuleMetadataJson,
  AiApiMetadataGraphEdge,
  AiApiMetadataGraphNode,
  AiApiNestedApiRecord,
  ApiObjectValidationFinding,
} from './metadata'

export {
  auditClassModelReflectionConnectivity,
  CLASS_MODEL_DOCUMENT_VERSION,
  collectModuleApiKinds,
  compareClassModelDocumentsForBuildConsistency,
  createClassModelDocumentFromModuleMetadata,
  createClassModelDocumentFromRuntimeDocument,
  jsonSchemaToTypeText,
  buildDtsClassModelBundle,
  DtsClassModelBundleLoader,
  DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
  DTS_CLASS_MODEL_BUNDLE_VERSION,
  DTS_FILE_PROJECTION_VERSION,
  listAttributeReachableKinds,
  projectDtsClassModelSurface,
  projectDtsFileProjection,
  projectClassModelForGuide,
  projectClassModelFromApi,
  renderMethodSignature,
  resolveModuleApi,
  resolveModuleApiOrUndefined,
} from './class-model'

export type {
  ClassModelBuildConsistencyIssue,
  ClassModelReflectionConnectivityIssue,
  DtsClassModelBundleManifest,
  DtsClassModelSurfaceDocument,
  DtsFileProjectionDocument,
} from './class-model'

export {
  renderAttributeDeclaration,
  renderAttributeGuide,
  renderClassModelDeclaration,
  renderMethodDeclaration,
  renderMethodGuide,
  renderModelGuide,
} from './projection'

export type {
  AttributeGuide,
  AttributeGuideRenderInput,
  MethodGuide,
  MethodGuideRenderInput,
  ModelGuide,
  ModelGuideRenderInput,
} from './projection'

export {
  ClassModelKnowledgeService,
  createClassModelKnowledgeWorkerApi,
  DtsBundleClassModelKnowledgeService,
  exposeClassModelKnowledgeWorker,
  WorkerClassModelKnowledgeProvider,
} from './knowledge'

export type {
  ClassModelKnowledgeServiceOptions,
  CreateClassModelKnowledgeWorkerApiOptions,
  DtsBundleClassModelKnowledgeServiceOptions,
  ClassModelAttributeGuideInput,
  ClassModelKnowledgeProvider,
  ClassModelKnowledgeWorkerApi,
  ClassModelKnowledgeWorkerInitInput,
  ClassModelKnowledgeQueryInput,
  ClassModelMethodGuideInput,
  ClassModelModelGuideInput,
} from './knowledge'

export {
  collectClassModelFailureModeRecoveryHints,
} from './recovery'

export type {
  ClassModelFailureModeRecoveryCommand,
  ClassModelFailureModeRecoveryContext,
} from './recovery'

export {
  CLASS_MODEL_TOOL_NAMES,
  buildClassModelToolSchemaRecoveryHint,
  findClassModelToolSpec,
  isClassModelToolName,
  listClassModelToolSpecs,
} from './tools'

export type {
  ClassModelToolName,
  ClassModelToolSpec,
} from './tools'

export {
  ClassModelRuntime,
} from './runtime'

export type {
  ClassModelRuntimeOptions,
  ClassModelScriptCommand,
  ClassModelScriptExecutor,
  ClassModelScriptExecutorResult,
  ClassModelToolArgs,
  ClassModelToolCheck,
  ClassModelToolResult,
} from './runtime'
