/**
 * @packageDocumentation
 *
 * SPARK AI 核心层统一出口。
 *
 * 阅读顺序建议：
 * 1. 先看业务注册契约，理解 business/module/function 如何声明。
 * 2. 再看调用协议与参数校验，理解 LLM 如何定位函数、提交参数。
 * 3. 最后看知识负载与运行时编排，理解实例生命周期、历史记录和事件。
 *
 * 核心层只负责把业务能力投影给 LLM，并按 `business@module@function`
 * 分发调用；业务服务的真实生命周期和状态仍由业务层自己管理。
 */

// 一、业务注册、运行时实例、函数调用等核心契约。
export type {
  AiBusinessRegistration,
  AiBusinessModuleRegistration,
  AiBusinessInstanceSummary,
  AiFunctionRegistration,
  AiRuntimeAction,
  AiRuntimeApi,
  AiRuntimeAppendMessage,
  AiRuntimeAppendMessagesOptions,
  AiRuntimeBusinessExposure,
  AiRuntimeBusinessId,
  AiRuntimeBusinessInstanceScope,
  AiRuntimeEvent,
  AiRuntimeEventListener,
  AiRuntimeEventType,
  AiRuntimeExecuteFunctionCallOptions,
  AiRuntimeExecuteFunctionCallResult,
  AiRuntimeFunctionExposure,
  AiRuntimeFunctionId,
  AiRuntimeFunctionCallRecord,
  AiRuntimeFunctionCallResult,
  AiRuntimeFunctionExposureSnapshot,
  AiRuntimeHistoryMessage,
  AiRuntimeHistorySnapshot,
  AiRuntimeInstanceDetail,
  AiRuntimeInstanceScope,
  AiRuntimeInstanceSnapshot,
  AiRuntimeInstanceStatus,
  AiRuntimeLifecycleMarker,
  AiRuntimeMessageRole,
  AiRuntimeModuleExposure,
  AiRuntimeModuleId,
  AiRuntimeOptions,
  AiRuntimeStartInstanceOptions,
  AiRuntimeStartInstanceResult,
  AiRuntimeStopBusinessInstanceOptions,
  AiRuntimeStopInstanceOptions,
  AiRuntimeStopInstanceResult,
  AiRuntimeStopMode,
  FunctionExecutionContext,
  FunctionFailureMode,
  ModulePromptContext,
  ModulePromptProvider,
  PostValidationWarning,
} from './protocol/business-contracts'

// 二、便捷基类：业务层可继承它们快速声明不可变 metadata。
export {
  AiBusinessModuleRegistrationBase,
  AiBusinessRegistrationBase,
} from './protocol/business-contracts'

// 三、LLM 调用协议：action 地址、消息、流式回调与 token usage。
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

// 四、LLM 参数校验：运行函数前对反序列化 JSON 参数做结构校验。
export {
  LlmParamsValidator,
} from './protocol/llm-params-validator'

export type {
  LlmParamValidationIssue,
  LlmParamValidationOptions,
  LlmParamValidationResult,
} from './protocol/llm-params-validator'

// 五、知识负载注册中心：把组件目录、数据集等外部知识按 payloadRef 暴露。
export {
  KnowledgePayloadRegistry,
} from './knowledge/payload-provider-registry'

export type {
  KnowledgePayloadGuide,
  KnowledgePayloadProvider,
  KnowledgePayloadQueryFilter,
  KnowledgePayloadSummary,
} from './protocol/knowledge-payload-contracts'

// 六、运行时编排器：管理实例生命周期、历史、事件和函数分发。
export {
  AiRuntime,
} from './runtime/ai-runtime'
