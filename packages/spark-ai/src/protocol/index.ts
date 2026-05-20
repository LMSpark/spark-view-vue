/**
 * @packageDocumentation
 *
 * SPARK AI runtime protocol public entry point.
 *
 * The protocol layer owns the framework-neutral public surface: module
 * registration contracts, runtime/session protocol types, tool-call codecs,
 * parameter validation, knowledge projection, and runtime module handles.
 */

// 一、模块注册、生命周期通知、知识投影与函数调用翻译契约。
// 这里不再为 JS 基础类型保留导出别名，直接使用原生类型。
export type {
  AiModuleRegistration,
  AiModuleInstanceBinding,
  AiModuleInstanceParam,
  AiFunctionRegistration,
  AiRuntimeAppendFunctionCallOptions,
  AiRuntimeAppendMessageOptions,
  AiRuntimeCompleteFunctionCallOptions,
  AiRuntimeExecuteFunctionCallOptions,
  AiRuntimeActivePathSnapshot,
  AiRuntimeCreateFunctionResultMessageOptions,
  AiRuntimeFunctionContextParam,
  AiRuntimeFunctionExposure,
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
  AiRuntimeInstanceScope,
  AiRuntimeKnowledgeProjection,
  AiRuntimeMessageHistoryEntry,
  AiRuntimeMessageRole,
  AiRuntimeMessageSource,
  AiRuntimeModuleExposure,
  AiRuntimeOptions,
  AiRuntimeProjectKnowledgeOptions,
  AiRuntimeRecordFunctionCallRequestOptions,
  AiRuntimeSessionRecord,
  AiRuntimeSessionLifecycleSnapshot,
  AiRuntimeSessionStatus,
  AiRuntimeStartSessionOptions,
  AiRuntimeStartSessionResult,
  AiRuntimeStopSessionOptions,
  AiRuntimeStopSessionResult,
  AiRuntimeTranslateFunctionCallOptions,
  FunctionExecutionContext,
  FunctionFailureMode,
  ModulePromptContext,
  ModulePromptProvider,
} from './runtime-contracts'

// 二、便捷基类：模块实现可继承它快速声明不可变 metadata。
export {
  AiModuleRegistrationBase,
} from './runtime-contracts'

// 三、LLM 调用协议：action 地址、消息、流式回调与 token usage。
export {
  AiInvocationProtocol,
} from '../internal/invocation-helpers'

export {
  AiRuntimeToolCodec,
} from '../internal/tool-codec'

export {
  addGuidedAiToolAction,
  createInitialAiToolActionSet,
} from '../internal/tool-exposure-policy'

export type {
  ActionPathParts,
  TokenUsage,
} from '../internal/invocation-helpers'

export type {
  AiRuntimeToolCodecOptions,
  AiRuntimeToolSpec,
} from '../internal/tool-codec'

export type {
  AiRuntimeToolExposurePolicyOptions,
} from '../internal/tool-exposure-policy'

// 四、LLM 参数校验：运行函数前对反序列化 JSON 参数做结构校验。
export {
  LlmParamsValidator,
} from '../internal/llm-params-validator'

// 四.五、JSON Schema 便捷构造器：为函数参数 schema 提供统一 DSL。
export {
  anySchema,
  arraySchema,
  booleanSchema,
  enumSchema,
  noParamsSchema,
  numberSchema,
  objectSchema,
  paramsSchema,
  stringSchema,
} from '../internal/json-schema-helpers'

export type {
  JsonSchemaProperties,
} from '../internal/json-schema-helpers'

export type {
  LlmParamValidationIssue,
  LlmParamValidationResult,
} from '../internal/llm-params-validator'

export type {
  LlmJsonObject,
  LlmJsonSchema,
  LlmJsonSchemaObject,
  LlmJsonSchemaType,
  LlmJsonValue,
  LlmParameterSchemaRoot,
} from './parameter-schema'

// 五、知识投影统一窗口：为 LLM FC、后端 API 提供统一的知识查询入口（函数、模块目录）。
export {
  AiKnowledgeProjector,
} from '../internal/knowledge/knowledge-projection'

export {
  AiKnowledgeCatalog,
} from '../internal/knowledge/knowledge-tool-catalog'

export type {
  AiKnowledgeFunctionSummary,
  AiKnowledgeModuleSummary,
  AiKnowledgeScope,
} from '../internal/knowledge/knowledge-projection'

export type {
  AiKnowledgeCatalogRowOptions,
  AiKnowledgeFunctionFailureMode,
  AiKnowledgeFunctionId,
  AiKnowledgeFunctionParameterRow,
  AiKnowledgeFunctionTarget,
} from '../internal/knowledge/knowledge-tool-catalog'

// 六、runtime facade：注册模块并返回模块绑定 API，接收生命周期通知，提供知识投影和函数调用翻译。
export {
  AiRuntime,
} from '../internal/runtime/ai-runtime'

export {
  AiRegisteredModule,
} from '../internal/runtime/ai-registered-module'
