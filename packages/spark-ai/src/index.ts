/**
 * @packageDocumentation
 *
 * SPARK AI runtime package public entry point.
 *
 * The package exposes recursive module-registration contracts, the in-memory
 * `AiRuntime` orchestrator, page-design module tools, and component catalog
 * projection helpers used by the SPARK configuration workflow.
 */

export {
  AiRuntime,
  AiInvocationProtocol,
  LlmParamsValidator,
  KnowledgePayloadRegistry,
} from './core'

export type {
  AiRuntimeApi,
  AiRuntimeAction,
  AiRuntimeAppendMessage,
  AiRuntimeAppendMessagesOptions,
  AiModuleRegistration,
  AiModuleInstanceBinding,
  AiModuleInstanceParam,
  AiRuntimeActivePathSnapshot,
  AiRuntimeEvent,
  AiRuntimeEventListener,
  AiRuntimeEventType,
  AiRuntimeExecuteFunctionCallOptions,
  AiRuntimeExecuteFunctionCallResult,
  AiRuntimeClearActivePathOptions,
  AiRuntimeFunctionContextParam,
  AiRuntimeFunctionCallRecord,
  AiRuntimeFunctionCallResult,
  AiRuntimeFunctionExposure,
  AiRuntimeFunctionExposureSnapshot,
  AiRuntimeHistoryMessage,
  AiRuntimeHistorySnapshot,
  AiRuntimeInstanceDetail,
  AiRuntimeInstanceSnapshot,
  AiRuntimeInstanceStatus,
  AiRuntimeLifecycleMarker,
  AiRuntimeMessageRole,
  AiRuntimeFunctionId,
  AiRuntimeModuleExposure,
  AiRuntimeModuleId,
  AiRuntimeModuleInstanceId,
  AiRuntimeModuleInstanceScope,
  AiRuntimeModulePath,
  AiRuntimeOptions,
  AiRuntimeSetActivePathOptions,
  AiRuntimeStartInstanceOptions,
  AiRuntimeStartInstanceResult,
  AiRuntimeStopMode,
  AiRuntimeStopInstanceOptions,
  AiRuntimeStopInstanceResult,
  AiRuntimeStopModuleInstanceOptions,
  AiRuntimeInstanceScope,
  AiFunctionRegistration,
  FunctionFailureMode,
  FunctionExecutionContext,
  ModulePromptContext,
  ModulePromptProvider,
  PostValidationWarning,
  ActionPathParts,
  ProtocolRole,
  ProtocolMessage,
  TokenUsage,
  StreamCallbacks,
  LlmParamValidationIssue,
  LlmParamValidationOptions,
  LlmParamValidationResult,
  KnowledgePayloadGuide,
  KnowledgePayloadProvider,
  KnowledgePayloadQueryFilter,
  KnowledgePayloadSummary,
} from './core'

export {
  PageDesignComponentPayloadProvider,
  PageDesignDatasetCatalog,
  PageDesignEditActionClassifier,
  PageDesignEditFlowPrompts,
  PageDesignEditRuntimePrompt,
  PageDesignEditSession,
  PageDesignLifecycleCatalog,
  PageDesignNodeTreeCatalog,
  PageDesignPageCache,
  PageDesignModule,
  PageDesignTextModelCatalog,
} from './business/page-design'

export type {
  PageDesignModuleContext,
  PageDesignModuleOptions,
  PageDesignRuntimeContext,
  PageDesignServiceState,
  EditToolHost,
  PageDesignNodeTree,
  PageCacheHandle,
} from './business/page-design'

export { COMPONENT_CATALOG_JSON } from './catalog'

export {
  projectComponentDirectory,
  projectComponentSpec,
  projectComponentConfigGuide,
  projectHydratedComponent,
  projectDevTypes,
  projectDevPropNames,
  projectDevPropEnums,
} from './catalog'

export type {
  ComponentDirectoryPayload,
  ComponentSpec,
  ComponentConfigGuide,
  HydratedComponentEntry,
  HydratedPropEntry,
  HydratedEmitEntry,
} from './catalog'

export type {
  RawComponentCatalog,
  RawComponentEntry,
  ComponentCatalog,
  ComponentEntry,
  ComponentRegistry,
  PropEntry,
  PropSchema,
  EmitEntry,
  PlatformConstraints,
  NestingRule,
  RootFieldEntry,
  CatalogBindingDescriptor,
  SharedTypeDefinition,
} from './catalog'

export {
  DEV_TYPES,
  DEV_PROP_NAMES,
  DEV_PROP_ENUMS,
  DEV_TYPE_LABELS,
  DEV_REQUIRED_PROPS,
} from './catalog'

export type {
  FunctionCatalog,
  FunctionCatalogRegistry,
  FunctionComponentEntry,
  FunctionPropEntry,
} from './catalog'
