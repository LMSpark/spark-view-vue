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
  AiRegisteredModule,
  AiRuntime,
  AiInvocationProtocol,
  LlmParamsValidator,
  addGuidedAiToolAction,
  AiRuntimeToolCodec,
  createInitialAiToolActionSet,
} from './core'

export type {
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
  AiRuntimeFunctionCallResultNormalizer,
  AiRuntimeFunctionCallRunInput,
  AiRuntimeFunctionCallRunner,
  AiRuntimeFunctionCallValidator,
  AiRuntimeFunctionExposure,
  AiRuntimeFunctionResultMessage,
  AiRuntimeHistoryEntry,
  AiRuntimeHistoryEntryBase,
  AiKnowledgeFunctionSummary,
  AiKnowledgeModuleSummary,
  AiKnowledgeProjection,
  AiKnowledgeScope,
  AiRuntimeFunctionId,
  AiRuntimeKnowledgeProjection,
  AiRuntimeMessageHistoryEntry,
  AiRuntimeMessageRole,
  AiRuntimeMessageSource,
  AiRuntimeModuleExposure,
  AiRuntimeModuleId,
  AiRuntimeModuleInstanceId,
  AiRuntimeModulePath,
  AiRuntimeOptions,
  AiRuntimeProjectKnowledgeOptions,
  AiRuntimeExecuteFunctionCallOptions,
  AiRuntimeRecordFunctionCallRequestOptions,
  AiRuntimeSessionRecord,
  AiRuntimeSessionLifecycleSnapshot,
  AiRuntimeSessionStatus,
  AiRuntimeStartSessionOptions,
  AiRuntimeStartSessionResult,
  AiRuntimeStopSessionOptions,
  AiRuntimeStopSessionResult,
  AiRuntimeTranslateFunctionCallOptions,
  AiRuntimeToolCodecOptions,
  AiRuntimeToolExposurePolicyOptions,
  AiRuntimeToolSpec,
  AiRuntimeInstanceScope,
  AiFunctionRegistration,
  FunctionFailureMode,
  FunctionExecutionContext,
  ModulePromptContext,
  ModulePromptProvider,
  ActionPathParts,
  TokenUsage,
  LlmJsonObject,
  LlmJsonPrimitive,
  LlmJsonSchema,
  LlmJsonSchemaObject,
  LlmJsonSchemaType,
  LlmJsonValue,
  LlmParameterSchemaRoot,
  LlmParamValidationIssue,
  LlmParamValidationResult,
} from './core'

export {
  PageDesignModule,
  DatasetModule,
  PageDesignEditActionClassifier,
  PageDesignEditFlowPrompts,
  PageDesignEditRuntimePrompt,
  LifecycleModule,
  NodeTreeModule,
  TextModelModule,
} from './registrations/page-design'

export type {
  DatasetCrudToolFunctionFailureMode,
  DatasetCrudToolFunctionId,
  EditLifecycleFunctionFailureMode,
  EditLifecycleFunctionId,
  PageDesignModuleId,
  PageDesignModuleOptions,
  SparkNodeTreeToolFailureMode,
  SparkNodeTreeToolFunctionId,
  TextModelFunctionFailureMode,
  TextModelFunctionFileKey,
  TextModelFunctionId,
} from './registrations/page-design'

export {
  LeaveRequestModule,
  LeaveRequestService,
  LeaveRequestModuleRegistration,
} from './registrations/leave-request'

export type {
  LeaveRequestDraftFields,
  LeaveRequestDraftState,
  LeaveRequestDraftStatus,
  LeaveRequestServiceContext,
  LeaveRequestServiceResult,
} from './registrations/leave-request'
