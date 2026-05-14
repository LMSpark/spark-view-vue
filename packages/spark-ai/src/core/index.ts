/**
 * @packageDocumentation
 *
 * SPARK AI 核心层统一出口。
 *
 * 阅读顺序建议：
 * 1. 先看模块注册契约，理解 module/function 如何声明。
 * 2. 再看调用协议与参数校验，理解 LLM 如何定位函数、提交参数。
 * 3. 最后看参数 payload 与 core facade，理解 LLM 知识投影、函数调用翻译和执行翻译链路。
 *
 * 核心层只负责把模块能力投影给 LLM，并把 `rootInstance[/childInstance]@module@actionName`
 * 调用翻译成可运行上下文，再统一记录 requested/completed/failed；模块服务生命周期和落点绑定由注册方管理。
 */

// 一、模块注册、生命周期通知、知识投影与函数调用翻译契约。
export type {
  AiModuleRegistration,
  AiModuleRegistrationData,
  AiModuleRegistrationStoreModule,
  AiModuleRegistrationStoreSnapshot,
  AiBusinessRegistration,
  AiBusinessRegistrationData,
  AiBusinessRegistrationStoreSnapshot,
  AiModuleInstanceBinding,
  AiModuleInstanceParam,
  AiFunctionRegistration,
  AiFunctionRegistrationData,
  AiFunctionRegistrationFailureMode,
  AiFunctionRegistrationStoreFunction,
  AiFunctionRegistrationUsageRule,
  AiRegisteredModuleApi,
  AiRegisteredBusinessApi,
  AiRegisteredModuleAppendFunctionCallOptions,
  AiRegisteredModuleAppendMessageOptions,
  AiRegisteredModuleCompleteFunctionCallOptions,
  AiRegisteredModuleExecuteFunctionCallOptions,
  AiRegisteredModuleProjectModuleOptions,
  AiRegisteredModuleRecordFunctionCallRequestOptions,
  AiRegisteredModuleStartInstanceOptions,
  AiRegisteredModuleStopInstanceOptions,
  AiRegisteredModuleTranslateFunctionCallOptions,
  AiRuntimeAppendFunctionCallOptions,
  AiRuntimeAppendMessageOptions,
  AiRuntimeCompleteFunctionCallOptions,
  AiRuntimeExecuteFunctionCallOptions,
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
  AiRuntimeFunctionCallResultNormalizer,
  AiRuntimeFunctionCallResult,
  AiRuntimeFunctionCallRunInput,
  AiRuntimeFunctionCallRunner,
  AiRuntimeFunctionCallValidator,
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
} from './protocol/runtime-contracts'

// 二、便捷基类：模块实现可继承它快速声明不可变 metadata。
export {
  AiModuleRegistrationBase,
} from './protocol/runtime-contracts'

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
  LlmParamValidationResult,
} from './protocol/llm-params-validator'

export type {
  LlmJsonObject,
  LlmJsonPrimitive,
  LlmJsonSchema,
  LlmJsonSchemaObject,
  LlmJsonSchemaType,
  LlmJsonValue,
  LlmParameterSchemaRoot,
} from './protocol/parameter-schema'

// 五、参数 payload 注册中心：把外部参数源按 payloadRef 暴露。
export {
  ParameterPayloadRegistry,
} from './internal/knowledge/parameter-payload-registry'

export type {
  ParameterPayloadFailureMode,
  ParameterPayloadGuide,
  ParameterPayloadProvider,
  ParameterPayloadQueryFilter,
  ParameterPayloadSummary,
} from './protocol/parameter-payload-contracts'

// 五.五、核心层知识投影统一窗口：为 LLM FC、后端 API 提供统一的知识查询入口（函数、模块、参数目录）。
export {
  AiKnowledgeProjector,
} from './internal/knowledge/knowledge-projection'

export {
  AiKnowledgeCatalog,
} from './internal/knowledge/knowledge-tool-catalog'

export type {
  AiKnowledgeFunctionSummary,
  AiKnowledgeModuleSummary,
  AiKnowledgeScope,
  AiKnowledgeProjection,
} from './internal/knowledge/knowledge-projection'

export type {
  AiKnowledgeCatalogOptions,
  AiKnowledgeCatalogRowOptions,
  AiKnowledgeFunctionCapabilityRow,
  AiKnowledgeFunctionFailureMode,
  AiKnowledgeFunctionId,
  AiKnowledgeFunctionParameterRow,
  AiKnowledgeFunctionTarget,
} from './internal/knowledge/knowledge-tool-catalog'

// 六、core facade：注册模块并返回模块绑定 API，接收生命周期通知，提供知识投影和函数调用翻译。
export {
  AiRuntime,
} from './internal/runtime/ai-runtime'
