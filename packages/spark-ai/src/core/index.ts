// AI Runtime Layer — business registration and LLM-facing runtime instance API.
//
// 核心层不拥有业务生命周期；业务服务自管状态并注册业务/模块/函数信息。
// runtime 负责把业务注册事实投影给 LLM，并按 business@module@function 分发调用。

export type {
  AiRuntimeApi,
  AiRuntimeAction,
  AiRuntimeAppendMessage,
  AiRuntimeAppendMessagesOptions,
  AiBusinessRegistration,
  AiBusinessModuleRegistration,
  AiBusinessServiceStatus,
  AiRuntimeEvent,
  AiRuntimeEventListener,
  AiRuntimeEventType,
  AiRuntimeExecuteFunctionCallOptions,
  AiRuntimeExecuteFunctionCallResult,
  AiRuntimeBusinessExposure,
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
  AiRuntimeBusinessId,
  AiRuntimeFunctionId,
  AiRuntimeModuleExposure,
  AiRuntimeModuleId,
  AiRuntimeOptions,
  AiRuntimeStartInstanceOptions,
  AiRuntimeStartInstanceResult,
  AiRuntimeStopMode,
  AiRuntimeStopInstanceOptions,
  AiRuntimeStopInstanceResult,
  AiRuntimeInstanceScope,
  AiFunctionRegistration,
  FunctionFailureMode,
  FunctionExecutionContext,
  ModulePromptContext,
  ModulePromptProvider,
  PostValidationWarning,
} from './protocol/business-contracts'

export {
  AiRuntime,
} from './runtime/ai-runtime'

export {
  AiInvocationProtocol,
} from './protocol/invocation-helpers'

export type {
  ActionAddressParts,
  ProtocolRole,
  ProtocolMessage,
  TokenUsage,
  StreamCallbacks,
} from './protocol/invocation-helpers'

export {
  LlmParamsValidator,
} from './protocol/llm-params-validator'

export type {
  LlmParamValidationIssue,
  LlmParamValidationOptions,
  LlmParamValidationResult,
} from './protocol/llm-params-validator'

export {
  KnowledgePayloadRegistry,
} from './knowledge/payload-provider-registry'

export type {
  KnowledgePayloadGuide,
  KnowledgePayloadProvider,
  KnowledgePayloadQueryFilter,
  KnowledgePayloadSummary,
} from './protocol/knowledge-payload-contracts'
