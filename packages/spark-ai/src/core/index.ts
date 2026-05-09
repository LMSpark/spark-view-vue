/**
 * @packageDocumentation
 *
 * SPARK AI 核心层统一出口。
 *
 * 阅读顺序建议：
 * 1. 先看模块注册契约，理解 module/function 如何声明。
 * 2. 再看调用协议与参数校验，理解 LLM 如何定位函数、提交参数。
 * 3. 最后看知识负载与 core facade，理解 LLM 知识投影和函数调用翻译。
 *
 * 核心层只负责把模块能力投影给 LLM，并把 `rootInstance[/childInstance]@module@function`
 * 调用翻译成注册方可执行的上下文；业务服务生命周期和函数派发由注册方管理。
 */

// 一、模块注册、生命周期通知、知识投影与函数调用翻译契约。
export type {
  AiModuleRegistration,
  AiModuleInstanceBinding,
  AiModuleInstanceParam,
  AiFunctionRegistration,
  AiRegisteredModuleApi,
  AiRegisteredModuleAppendFunctionCallOptions,
  AiRegisteredModuleAppendMessageOptions,
  AiRegisteredModuleCompleteFunctionCallOptions,
  AiRegisteredModuleProjectModuleOptions,
  AiRegisteredModuleRecordFunctionCallRequestOptions,
  AiRegisteredModuleStartInstanceOptions,
  AiRegisteredModuleStopInstanceOptions,
  AiRegisteredModuleTranslateFunctionCallOptions,
  AiRuntimeAppendFunctionCallOptions,
  AiRuntimeAppendMessageOptions,
  AiRuntimeCompleteFunctionCallOptions,
  AiRuntimeAction,
  AiRuntimeActivePathSnapshot,
  AiRuntimeApi,
  AiRuntimeCreateFunctionResultMessageOptions,
  AiRuntimeFunctionContextParam,
  AiRuntimeFunctionExposure,
  AiRuntimeFunctionId,
  AiRuntimeFunctionCallTranslation,
  AiRuntimeFunctionCallTranslationResult,
  AiRuntimeFunctionCallFailure,
  AiRuntimeFunctionCallHistoryEntry,
  AiRuntimeFunctionCallHistoryStatus,
  AiRuntimeFunctionCallResult,
  AiRuntimeFunctionResultMessage,
  AiRuntimeHistoryEntry,
  AiRuntimeHistoryEntryBase,
  AiRuntimeHistoryEntryKind,
  AiRuntimeInstanceLifecycleSnapshot,
  AiRuntimeInstanceScope,
  AiRuntimeInstanceStatus,
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
  FunctionExecutionContext,
  FunctionFailureMode,
  ModulePromptContext,
  ModulePromptProvider,
} from './protocol/business-contracts'

// 二、便捷基类：模块实现可继承它快速声明不可变 metadata。
export {
  AiModuleRegistrationBase,
} from './protocol/business-contracts'

// 三、LLM 调用协议：action 地址、消息、流式回调与 token usage。
export {
  AiInvocationProtocol,
} from './protocol/invocation-helpers'

export type {
  ActionPathParts,
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

// 六、core facade：注册模块并返回模块绑定 API，接收生命周期通知，提供知识投影和函数调用翻译。
export {
  AiRuntime,
} from './runtime/ai-runtime'
