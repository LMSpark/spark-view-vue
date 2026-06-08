export type {
  AttributeMeta,
  ChildModelLink,
  ClassModel,
  ClassModelDiagnostic,
  ClassModelDocument,
  ConstructorMeta,
  JsDocMeta,
  JsDocTagMeta,
  MethodMeta,
  SourceProvenanceMeta,
} from './class-model'

export {
  AiApiObjectMetadataValidationError,
  MODULE_METADATA_RUNTIME_JSON_SCHEMA,
  collectNestedApiRecords,
  readModuleMetadataRuntimeDocument,
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
  AiApiJsDocTagMetadata,
  AiApiObjectMetadata,
  AiApiResultApiRef,
  AiApiSourceProvenanceMetadata,
  AiModuleMetadataJson,
  AiApiMetadataGraphEdge,
  AiApiMetadataGraphNode,
  AiApiNestedApiRecord,
  ApiObjectValidationFinding,
  ModuleMetadataRuntimeDocument,
} from './metadata'

export {
  CLASS_MODEL_DOCUMENT_VERSION,
  compareClassModelDocumentsForBuildConsistency,
  createClassModelDocumentFromModuleMetadata,
  createClassModelDocumentFromRuntimeDocument,
  jsonSchemaToTypeText,
} from './class-model'

export type {
  ClassModelBuildConsistencyIssue,
} from './class-model'

export {
  renderAttributeDeclaration,
  renderAttributeGuide,
  renderClassModelDeclaration,
  renderComponentPropsDeclaration,
  renderMethodDeclaration,
  renderMethodGuide,
  renderModelGuide,
} from './projection'

export type {
  AttributeGuide,
  AttributeGuideRenderInput,
  ComponentCatalogLike,
  MethodGuide,
  MethodGuideRenderInput,
  ModelGuide,
  ModelGuideRenderInput,
} from './projection'

export {
  ClassModelKnowledgeService,
  createVcmNativeKnowledgeWorkerApi,
  exposeVcmNativeKnowledgeWorker,
  WorkerVcmNativeKnowledgeProvider,
} from './knowledge'

export type {
  ClassModelKnowledgeServiceOptions,
  CreateVcmNativeKnowledgeWorkerApiOptions,
  VcmNativeAttributeGuideInput,
  VcmNativeKnowledgeProvider,
  VcmNativeKnowledgeWorkerApi,
  VcmNativeKnowledgeWorkerInitInput,
  VcmNativeKnowledgeQueryInput,
  VcmNativeMethodGuideInput,
  VcmNativeModelGuideInput,
} from './knowledge'

export {
  VCM_NATIVE_TOOL_NAMES,
  isVcmNativeToolName,
} from './tools'

export type {
  VcmNativeToolName,
} from './tools'

export {
  VcmNativeRuntime,
} from './runtime'

export type {
  VcmNativeRuntimeOptions,
  VcmNativeScriptCommand,
  VcmNativeScriptExecutor,
  VcmNativeScriptExecutorResult,
  VcmNativeToolArgs,
  VcmNativeToolCheck,
  VcmNativeToolResult,
  VcmNativeToolSpec,
} from './runtime'
