/**
 * AI Host 交互协议。
 *
 * Core 对外 API、注册 handle、会话生命周期通知、函数调用翻译与执行链路。
 * AI Host（上层应用）通过 `AiRuntimeApi` 注册业务/模块，
 * 通过 handle 的 `startSession` / `executeFunctionCall` 等方法驱动 AI 会话。
 */

import type { LlmJsonObject, LlmParameterSchemaRoot } from './parameter-schema'
import type {
  AiFunctionRegistration,
  AiModuleRegistration,
  IBusinessRegistration,
  AiModuleInstanceParam,
  AiModuleRegistrationStoreSnapshot,
  IBusinessRegistrationStoreSnapshot,
  IBusinessRegistrationData,
  AiModuleRegistrationData,
  FunctionFailureMode,
  AiRuntimeModuleId,
  AiRuntimeModuleInstanceId,
  AiRuntimeModulePath,
  AiRuntimeFunctionId,
} from './business-registration'
import type {
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

// ── Re-export 基础 ID（business-registration 定义） ──

export type {
  AiRuntimeModuleId,
  AiRuntimeModuleInstanceId,
  AiRuntimeModulePath,
  AiRuntimeFunctionId,
} from './business-registration'

export type AiRuntimeAction = string

// ── 实例上下文 ──

export interface AiRuntimeInstanceScope {
  readonly moduleId: AiRuntimeModuleId
  readonly moduleInstanceId: AiRuntimeModuleInstanceId
  readonly instanceId: string
  readonly runtimeInstanceId: string
}

export interface AiModuleInstanceBinding {
  readonly modulePath: AiRuntimeModulePath
  readonly instanceId: AiRuntimeModuleInstanceId
  readonly paramName?: string
}

export interface AiRuntimeActivePathSnapshot {
  readonly instanceId: string
  readonly bindings: readonly AiModuleInstanceBinding[]
  readonly moduleInstances: Readonly<Record<string, string>>
}

// ── Prompt/执行上下文 ──

export interface ModulePromptContext extends AiRuntimeInstanceScope {
  readonly modulePath: AiRuntimeModulePath
  readonly moduleIds: readonly string[]
}

export interface FunctionExecutionContext extends AiRuntimeInstanceScope {
  readonly modulePath: AiRuntimeModulePath
  readonly moduleIds: readonly string[]
  readonly functionId: AiRuntimeFunctionId
  readonly action: AiRuntimeAction
  readonly moduleInstances: Readonly<Record<string, string>>
  readonly activePath: AiRuntimeActivePathSnapshot
}

// ── 知识投影 ──

export interface AiRuntimeFunctionContextParam {
  readonly modulePath: AiRuntimeModulePath
  readonly moduleId: AiRuntimeModuleId
  readonly paramName: string
  readonly description: string
}

export interface AiRuntimeFunctionExposure {
  readonly action: AiRuntimeAction
  readonly moduleId: AiRuntimeModuleId
  readonly modulePath: AiRuntimeModulePath
  readonly moduleIds: readonly string[]
  readonly description: string
  readonly paramsSchema: LlmParameterSchemaRoot
  readonly resultSchema?: LlmJsonObject | undefined
  readonly maxExecutionMs?: number | undefined
  readonly usageRules?: readonly string[] | undefined
  readonly failureModes?: readonly FunctionFailureMode[] | undefined
  readonly example?: LlmJsonObject | undefined
  readonly contextParams: readonly AiRuntimeFunctionContextParam[]
}

export interface AiRuntimeModuleExposure {
  readonly moduleId: AiRuntimeModuleId
  readonly modulePath: AiRuntimeModulePath
  readonly moduleIds: readonly string[]
  readonly name: string
  readonly description: string
  readonly prompt?: string | undefined
  readonly instanceParam?: AiModuleInstanceParam | undefined
  readonly functions: readonly AiRuntimeFunctionExposure[]
  readonly modules: readonly AiRuntimeModuleExposure[]
}

export interface AiRuntimeKnowledgeProjection {
  readonly scope: AiRuntimeInstanceScope
  readonly module: AiRuntimeModuleExposure
  readonly promptSnapshot: string
  readonly availableFunctions: readonly AiRuntimeFunctionExposure[]
}

// ── 函数调用翻译 ──

export interface AiRuntimeTranslateFunctionCallOptions extends AiRuntimeInstanceScope {
  readonly action: AiRuntimeAction
  readonly args: unknown
  readonly activePath?: readonly AiModuleInstanceBinding[] | undefined
  readonly projection?: AiRuntimeKnowledgeProjection | undefined
}

export interface AiRuntimeFunctionCallTranslation {
  readonly action: AiRuntimeAction
  readonly rawArgs: unknown
  readonly effectiveArgs: Record<string, unknown>
  readonly executionArgs: unknown
  readonly context: FunctionExecutionContext
  readonly exposure: AiRuntimeFunctionExposure
  readonly moduleRegistration: AiModuleRegistration
  readonly functionRegistration: AiFunctionRegistration
}

export type AiRuntimeFunctionCallTranslationResult =
  | { ok: true; translation: AiRuntimeFunctionCallTranslation }
  | AiRuntimeFunctionCallFailure

// ── 函数调用执行 ──

export interface AiRuntimeFunctionCallRunInput {
  readonly translation: AiRuntimeFunctionCallTranslation
  readonly moduleRegistration: AiModuleRegistration
  readonly functionRegistration: AiFunctionRegistration
  readonly args: unknown
  readonly context: FunctionExecutionContext
}

export type AiRuntimeFunctionCallRunner = (input: AiRuntimeFunctionCallRunInput) => unknown
export type AiRuntimeFunctionCallValidator = (input: AiRuntimeFunctionCallRunInput) => string | null
export type AiRuntimeFunctionCallResultNormalizer = (
  value: unknown,
  input: AiRuntimeFunctionCallRunInput,
) => AiRuntimeFunctionCallResult<unknown>

export interface AiRuntimeExecuteFunctionCallOptions extends AiRuntimeTranslateFunctionCallOptions {
  readonly run: AiRuntimeFunctionCallRunner
  readonly validate?: AiRuntimeFunctionCallValidator | undefined
  readonly normalizeResult?: AiRuntimeFunctionCallResultNormalizer | undefined
  readonly errorFix?: string | undefined
}

// ── 结果回传 ──

export interface AiRuntimeFunctionCallFailure {
  readonly ok: false
  readonly code: string
  readonly msg: string
  readonly fix: string
}

export type AiRuntimeFunctionCallResult<TResult = unknown> =
  | { ok: true; data: TResult; summary: string }
  | AiRuntimeFunctionCallFailure

export interface AiRuntimeCreateFunctionResultMessageOptions {
  readonly action: AiRuntimeAction
  readonly result: unknown
}

export interface AiRuntimeFunctionResultMessage {
  readonly action: AiRuntimeAction
  readonly result: unknown
  readonly content: string
}

// ── 其他 ──

export interface AiRuntimeProjectKnowledgeOptions extends AiRuntimeInstanceScope {}

export interface AiRuntimeOptions {
  now?: () => number
}

// ── API ──

export interface AiRegisteredModuleApi {
  readonly moduleId: AiRuntimeModuleId
  readonly registration: AiModuleRegistration
  getRegistration(): AiModuleRegistration
  getRegistrationData(): AiModuleRegistrationData
  getRegistrationStoreSnapshot(): AiModuleRegistrationStoreSnapshot
  getSession(moduleInstanceId: AiRuntimeModuleInstanceId): AiRuntimeSessionRecord | null
  getSessionHistory(moduleInstanceId: AiRuntimeModuleInstanceId): readonly AiRuntimeHistoryEntry[]
  appendMessage(options: Omit<AiRuntimeAppendMessageOptions, 'moduleId'>): AiRuntimeMessageHistoryEntry
  recordFunctionCallRequest(options: Omit<AiRuntimeRecordFunctionCallRequestOptions, 'moduleId'>): AiRuntimeFunctionCallHistoryEntry
  completeFunctionCall(options: Omit<AiRuntimeCompleteFunctionCallOptions, 'moduleId'>): AiRuntimeFunctionCallHistoryEntry
  appendFunctionCall(options: Omit<AiRuntimeAppendFunctionCallOptions, 'moduleId'>): AiRuntimeFunctionCallHistoryEntry
  startSession(options: Omit<AiRuntimeStartSessionOptions, 'moduleId'>): Promise<AiRuntimeStartSessionResult>
  stopSession(options: Omit<AiRuntimeStopSessionOptions, 'moduleId'>): AiRuntimeStopSessionResult
  projectKnowledge(options: Omit<AiRuntimeProjectKnowledgeOptions, 'moduleId'>): Promise<AiRuntimeKnowledgeProjection>
  translateFunctionCall(options: Omit<AiRuntimeTranslateFunctionCallOptions, 'moduleId'>): Promise<AiRuntimeFunctionCallTranslationResult>
  executeFunctionCall(options: Omit<AiRuntimeExecuteFunctionCallOptions, 'moduleId'>): Promise<AiRuntimeFunctionCallResult<unknown>>
  createFunctionResultMessage(options: AiRuntimeCreateFunctionResultMessageOptions): AiRuntimeFunctionResultMessage
}

export interface AiRegisteredBusinessApi extends AiRegisteredModuleApi {
  readonly businessId: AiRuntimeModuleId
  readonly businessRegistration: IBusinessRegistration
  getBusinessRegistration(): IBusinessRegistration
  getBusinessRegistrationData(): IBusinessRegistrationData
  getBusinessRegistrationStoreSnapshot(): IBusinessRegistrationStoreSnapshot
}

export interface AiRuntimeApi {
  registerBusiness(registration: IBusinessRegistration | IBusinessRegistrationData | IBusinessRegistrationStoreSnapshot): AiRegisteredBusinessApi
  registerModule(registration: AiModuleRegistration | AiModuleRegistrationData | AiModuleRegistrationStoreSnapshot): AiRegisteredModuleApi
  getKnowledgeProjection(): unknown
}

// ── Re-export 被 api 引用的类型（避免调用方再 import 其他文件） ──

export type {
  AiRuntimeSessionRecord,
  AiRuntimeHistoryEntry,
  AiRuntimeMessageHistoryEntry,
  AiRuntimeFunctionCallHistoryEntry,
  AiRuntimeHistoryEntryBase,
  AiRuntimeAppendMessageOptions,
  AiRuntimeAppendFunctionCallOptions,
  AiRuntimeRecordFunctionCallRequestOptions,
  AiRuntimeCompleteFunctionCallOptions,
  AiRuntimeStartSessionOptions,
  AiRuntimeStartSessionResult,
  AiRuntimeStopSessionOptions,
  AiRuntimeStopSessionResult,
  AiRuntimeSessionLifecycleSnapshot,
  AiRuntimeSessionStatus,
  AiRuntimeMessageRole,
  AiRuntimeMessageSource,
  AiRuntimeFunctionCallHistoryStatus,
} from './session-events'

export type {
  AiFunctionRegistration,
  AiModuleRegistration,
  IBusinessRegistration,
  IModuleRegistration,
  AiModuleRegistrationData,
  IBusinessRegistrationData,
  AiModuleRegistrationStoreModule,
  AiFunctionRegistrationStoreFunction,
  AiFunctionRegistrationUsageRule,
  AiFunctionRegistrationFailureMode,
  AiModuleRegistrationStoreSnapshot,
  IBusinessRegistrationStoreSnapshot,
  AiModuleInstanceParam,
  FunctionFailureMode,
  ModulePromptProvider,
} from './business-registration'
