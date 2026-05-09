/**
 * @packageDocumentation
 *
 * SPARK AI runtime package public entry point.
 *
 * The package exposes recursive module-registration contracts, the core
 * `AiRuntime` knowledge/translation facade, page-design module tools, and
 * component catalog projection helpers used by the SPARK configuration workflow.
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
  AiModuleRegistration,
  AiModuleInstanceBinding,
  AiModuleInstanceParam,
  AiRuntimeAppendFunctionCallOptions,
  AiRuntimeAppendMessageOptions,
  AiRuntimeCompleteFunctionCallOptions,
  AiRuntimeActivePathSnapshot,
  AiRuntimeCreateFunctionResultMessageOptions,
  AiRuntimeFunctionContextParam,
  AiRuntimeFunctionCallFailure,
  AiRuntimeFunctionCallHistoryEntry,
  AiRuntimeFunctionCallHistoryStatus,
  AiRuntimeFunctionCallTranslation,
  AiRuntimeFunctionCallTranslationResult,
  AiRuntimeFunctionCallResult,
  AiRuntimeFunctionExposure,
  AiRuntimeFunctionResultMessage,
  AiRuntimeHistoryEntry,
  AiRuntimeHistoryEntryBase,
  AiRuntimeHistoryEntryKind,
  AiRuntimeInstanceLifecycleSnapshot,
  AiRuntimeInstanceStatus,
  AiRuntimeFunctionId,
  AiRuntimeKnowledgeProjection,
  AiRuntimeMessageHistoryEntry,
  AiRuntimeMessageRole,
  AiRuntimeMessageSource,
  AiRuntimeModuleExposure,
  AiRuntimeModuleId,
  AiRuntimeModuleInstanceId,
  AiRuntimeModuleInstanceScope,
  AiRuntimeModulePath,
  AiRuntimeOptions,
  AiRuntimeProjectModuleOptions,
  AiRuntimeRecordFunctionCallRequestOptions,
  AiRuntimeSessionRecord,
  AiRuntimeSessionLifecycleSnapshot,
  AiRuntimeSessionStatus,
  AiRuntimeStartInstanceOptions,
  AiRuntimeStartInstanceResult,
  AiRuntimeStopInstanceOptions,
  AiRuntimeStopInstanceResult,
  AiRuntimeTranslateFunctionCallOptions,
  AiRuntimeInstanceScope,
  AiFunctionRegistration,
  FunctionFailureMode,
  FunctionExecutionContext,
  ModulePromptContext,
  ModulePromptProvider,
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
  PageDesignEditFunctionClassifier,
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
  PageDesignAppendMessageOptions,
  PageDesignExecuteFunctionCallOptions,
  PageDesignModuleContext,
  PageDesignModuleOptions,
  PageDesignRuntimeContext,
  PageDesignServiceState,
  PageDesignStopSessionOptions,
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
