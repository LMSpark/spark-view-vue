/**
 * @module @spark-appworks/spark-ai:class-model/index
 * 职责：维护 DTS ClassModel 知识链路中的 class-model 能力，围绕 模块入口、副作用注册或内部组合逻辑 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 ClassModel 在 class-model/index 这一段如何生成、加载或投影时，用本模块定位职责。
 */
export type {
  AttributeMeta,
  ClassModel,
  ClassModelDeclarationRelation,
  ClassModelDeclarationRelationKind,
  ClassModelDocument,
  ComponentClassModelLayer,
  ComponentClassModelLevel,
  ConstructorMeta,
  JsDocMeta,
  MethodMeta,
  SourceProvenanceMeta,
} from './class-model'

export {
  AiApiObjectMetadataValidationError,
  collectNestedApiRecords,
  resolveRuntimeApiMetadataJson,
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
  AiRuntimeApiMetadataJson,
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
  createClassModelDocumentFromRuntimeApiMetadata,
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
