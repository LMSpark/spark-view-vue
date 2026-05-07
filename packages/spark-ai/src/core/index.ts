// AI Core Layer — business registration and LLM adapter-session API.
//
// 核心层不拥有业务生命周期；业务服务自管状态并注册业务/模块/函数信息。
// core 负责把业务注册事实投影给 LLM，并按 business@module@function 分发调用。

export type {
  AiCore,
  AiCoreAction,
  AiCoreAppendMessage,
  AiCoreAppendMessagesOptions,
  AiBusinessRegistration,
  AiBusinessModuleRegistration,
  AiBusinessServiceStatus,
  AiCoreEvent,
  AiCoreEventListener,
  AiCoreEventType,
  AiCoreExecuteFunctionCallOptions,
  AiCoreExecuteFunctionCallResult,
  AiCoreBusinessExposure,
  AiCoreFunctionCallRecord,
  AiCoreFunctionCallResult,
  AiCoreFunctionExposure,
  AiCoreFunctionExposureSnapshot,
  AiCoreHistoryMessage,
  AiCoreHistorySnapshot,
  AiCoreInstanceDetail,
  AiCoreInstanceSnapshot,
  AiCoreInstanceStatus,
  AiCoreLifecycleMarker,
  AiCoreMessageRole,
  AiCoreBusinessId,
  AiCoreFunctionId,
  AiCoreModuleExposure,
  AiCoreModuleId,
  AiCoreOptions,
  AiCoreStartSessionOptions,
  AiCoreStartSessionResult,
  AiCoreStopMode,
  AiCoreStopSessionOptions,
  AiCoreStopSessionResult,
  AiCoreSessionScope,
  AiFunctionRegistration,
  FunctionFailureMode,
  FunctionExecutionContext,
  ModulePromptContext,
  ModulePromptProvider,
  PostValidationWarning,
} from './protocol/business-contracts'

export {
  createAiCore,
} from './runtime/ai-core'

export {
  KnowledgePayloadProviderRegistry,
  createKnowledgePayloadProviderRegistry,
  getKnowledgePayloadProviderRegistry,
  registerKnowledgePayloadProvider,
} from './knowledge/payload-provider-registry'

export type {
  KnowledgePayloadGuide,
  KnowledgePayloadProvider,
  KnowledgePayloadQueryFilter,
  KnowledgePayloadSummary,
} from './protocol/knowledge-payload-contracts'
