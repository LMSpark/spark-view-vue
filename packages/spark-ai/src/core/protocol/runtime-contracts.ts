/**
 * @packageDocumentation
 * 运行时协议总出口 — 按消费者分类：
 * 1. AI Host 交互协议（ai-host）
 * 2. 业务注册契约（business-registration）
 * 3. 会话事件协议（session-events）
 *
 * 所有类型均从分类文件中 re-export，保持向后兼容。
 */

// ── AI Host 协议（含全部 re-export） ──

export {
  AiModuleRegistrationBase,
} from './business-registration'

export type {
  // 基础 ID
  AiRuntimeModuleId,
  AiRuntimeModuleInstanceId,
  AiRuntimeModulePath,
  AiRuntimeFunctionId,
  // 会话
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
  AiRuntimeSessionLifecycleSnapshot,
  // AI Host 核心
  AiRuntimeAction,
  AiRuntimeInstanceScope,
  AiModuleInstanceBinding,
  AiRuntimeActivePathSnapshot,
  ModulePromptContext,
  FunctionExecutionContext,
  ModulePromptProvider,
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
  AiRegisteredBusinessApi,
  AiRuntimeApi,
  // 业务注册
  FunctionFailureMode,
  AiFunctionRegistration,
  IModuleRegistration,
  AiModuleRegistration,
  IBusinessRegistration,
  AiModuleRegistrationData,
  IBusinessRegistrationData,
  AiModuleRegistrationStoreModule,
  AiFunctionRegistrationStoreFunction,
  AiFunctionRegistrationUsageRule,
  AiFunctionRegistrationFailureMode,
  AiModuleRegistrationStoreSnapshot,
  IBusinessRegistrationStoreSnapshot,
  AiModuleInstanceParam,
  // 会话事件
  AiRuntimeSessionStatus,
  AiRuntimeMessageRole,
  AiRuntimeMessageSource,
  AiRuntimeFunctionCallHistoryStatus,
  AiRuntimeHistoryEntryBase,
} from './ai-host'
