/**
 * @packageDocumentation
 * 运行时协议总出口 — 按消费者分类：
 * 1. 模块注册契约（business-registration）
 * 2. 会话事件协议（session-events）
 * 3. Core 内部运行时协议（runtime-protocol）
 * 4. AI Host 交互协议（host-protocol）
 *
 * 所有类型均从分类文件中 re-export，作为 class-first runtime 契约面。
 */

// ── 业务注册 ──

export {
  AiModuleRegistrationBase,
} from './business-registration'

export type {
  AiRuntimeModuleId,
  AiRuntimeModuleInstanceId,
  AiRuntimeModulePath,
  AiRuntimeFunctionId,
  FunctionFailureMode,
  AiFunctionRegistration,
  AiModuleRegistration,
  AiModuleRegistrationData,
  AiModuleRegistrationStoreModule,
  AiFunctionRegistrationStoreFunction,
  AiFunctionRegistrationUsageRule,
  AiFunctionRegistrationFailureMode,
  AiModuleRegistrationStoreSnapshot,
  AiModuleInstanceParam,
  ModulePromptProvider,
  ModulePromptContext,
} from './business-registration'

// ── 会话事件 ──

export type {
  AiRuntimeSessionStatus,
  AiRuntimeSessionLifecycleSnapshot,
  AiRuntimeMessageRole,
  AiRuntimeMessageSource,
  AiRuntimeFunctionCallHistoryStatus,
  AiRuntimeHistoryEntryBase,
  AiRuntimeSessionRecord,
  AiRuntimeHistoryEntry,
  AiRuntimeMessageHistoryEntry,
  AiRuntimeFunctionCallHistoryEntry,
  AiRuntimeAppendMessageOptions,
  AiRuntimeAppendFunctionCallOptions,
  AiRuntimeRecordFunctionCallRequestOptions,
  AiRuntimeCompleteFunctionCallOptions,
  AiRuntimeStartSessionOptions,
  AiRuntimeStartSessionResult,
  AiRuntimeStopSessionOptions,
  AiRuntimeStopSessionResult,
} from './session-events'

// ── Core 内部运行时协议 ──

export type {
  AiRuntimeAction,
  AiRuntimeInstanceScope,
  AiModuleInstanceBinding,
  AiRuntimeActivePathSnapshot,
  FunctionExecutionContext,
  AiRuntimeFunctionContextParam,
  AiRuntimeFunctionExposure,
  AiRuntimeModuleExposure,
  AiRuntimeKnowledgeProjection,
  AiRuntimeTranslateFunctionCallOptions,
  AiRuntimeFunctionCallTranslation,
  AiRuntimeFunctionCallTranslationResult,
  AiRuntimeFunctionCallRunInput,
  AiRuntimeFunctionCallRunner,
  AiRuntimeFunctionCallValidator,
  AiRuntimeFunctionCallResultNormalizer,
  AiRuntimeExecuteFunctionCallOptions,
  AiRuntimeFunctionCallFailure,
  AiRuntimeFunctionCallResult,
  AiRuntimeCreateFunctionResultMessageOptions,
  AiRuntimeFunctionResultMessage,
  AiRuntimeProjectKnowledgeOptions,
  AiRuntimeOptions,
  AiRegisteredModuleApi,
  AiRuntimeApi,
} from './runtime-protocol'

// ── AI Host（app 层最小消费面） ──
// 已由上方 business-registration / session-events / runtime-protocol 覆盖，
// 此处直接导出工具层所需的 value 和类型。

export {
  createAiRuntimeToolCodec,
} from '../internal/tool-codec'

export {
  addGuidedAiToolAction,
  createInitialAiToolActionSet,
} from '../internal/tool-exposure-policy'

export {
  AiInvocationProtocol,
} from '../internal/invocation-helpers'

export type {
  AiRuntimeToolCodec,
  AiRuntimeToolCodecOptions,
} from '../internal/tool-codec'

export type {
  ActionPathParts,
  TokenUsage,
} from '../internal/invocation-helpers'
