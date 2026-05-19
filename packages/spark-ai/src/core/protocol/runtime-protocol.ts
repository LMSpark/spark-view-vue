/**
 * Core runtime protocol.
 *
 * These types describe the framework-neutral AI core surface: knowledge
 * projection, function-call translation/execution, and module-bound APIs.
 */

import type {
  AiFunctionRegistration,
  AiModuleInstanceParam,
  AiModuleRegistration,
  AiModuleRegistrationData,
  AiModuleRegistrationStoreSnapshot,
  AiRuntimeFunctionId,
  AiRuntimeModuleId,
  AiRuntimeModuleInstanceId,
  AiRuntimeModulePath,
  FunctionFailureMode,
} from './business-registration'
import type { LlmJsonObject, LlmParameterSchemaRoot } from './parameter-schema'
import type {
  AiRuntimeAppendFunctionCallOptions,
  AiRuntimeAppendMessageOptions,
  AiRuntimeCompleteFunctionCallOptions,
  AiRuntimeFunctionCallHistoryEntry,
  AiRuntimeHistoryEntry,
  AiRuntimeMessageHistoryEntry,
  AiRuntimeRecordFunctionCallRequestOptions,
  AiRuntimeSessionRecord,
  AiRuntimeStartSessionOptions,
  AiRuntimeStartSessionResult,
  AiRuntimeStopSessionOptions,
  AiRuntimeStopSessionResult,
} from './session-events'

export type {
  AiRuntimeFunctionId,
  AiRuntimeModuleId,
  AiRuntimeModuleInstanceId,
  AiRuntimeModulePath,
}

export type AiRuntimeAction = string

export interface AiRuntimeInstanceScope {
  readonly moduleId: AiRuntimeModuleId
  readonly moduleInstanceId: AiRuntimeModuleInstanceId
  readonly instanceId: string
  readonly runtimeInstanceId: string
}

export interface AiModuleInstanceBinding {
  readonly modulePath: AiRuntimeModulePath
  readonly instanceId: AiRuntimeModuleInstanceId
  readonly paramName?: string | undefined
}

export interface AiRuntimeActivePathSnapshot {
  readonly instanceId: string
  readonly bindings: readonly AiModuleInstanceBinding[]
  readonly moduleInstances: Readonly<Record<string, string>>
}

export interface FunctionExecutionContext extends AiRuntimeInstanceScope {
  readonly modulePath: AiRuntimeModulePath
  readonly moduleIds: readonly string[]
  readonly functionId: AiRuntimeFunctionId
  readonly action: AiRuntimeAction
  readonly moduleInstances: Readonly<Record<string, string>>
  readonly activePath: AiRuntimeActivePathSnapshot
}

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

export interface AiRuntimeFunctionCallFailure {
  readonly ok: false
  readonly code: string
  readonly msg: string
  readonly fix: string
}

export type AiRuntimeFunctionCallResult<TData> = {
  readonly ok: true
  readonly data?: TData | undefined
  readonly summary?: string | undefined
} | AiRuntimeFunctionCallFailure

export interface AiRuntimeFunctionResultMessage {
  readonly action: AiRuntimeAction
  readonly result: AiRuntimeFunctionCallResult<unknown>
  readonly content: string
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

export type AiRuntimeFunctionCallTranslationResult = {
  readonly ok: true
  readonly translation: AiRuntimeFunctionCallTranslation
} | AiRuntimeFunctionCallFailure

export interface AiRuntimeProjectKnowledgeOptions extends AiRuntimeInstanceScope {}

export interface AiRuntimeTranslateFunctionCallOptions extends AiRuntimeProjectKnowledgeOptions {
  readonly action: AiRuntimeAction
  readonly args: unknown
  readonly activePath?: readonly AiModuleInstanceBinding[] | undefined
  readonly projection?: AiRuntimeKnowledgeProjection | undefined
}

export interface AiRuntimeFunctionCallRunInput {
  readonly translation: AiRuntimeFunctionCallTranslation
  readonly moduleRegistration: AiModuleRegistration
  readonly functionRegistration: AiFunctionRegistration
  readonly args: unknown
  readonly context: FunctionExecutionContext
}

export type AiRuntimeFunctionCallValidator = (input: AiRuntimeFunctionCallRunInput) => string | null
export type AiRuntimeFunctionCallRunner = (input: AiRuntimeFunctionCallRunInput) => unknown
export type AiRuntimeFunctionCallResultNormalizer = (
  value: unknown,
  input: AiRuntimeFunctionCallRunInput,
) => AiRuntimeFunctionCallResult<unknown>

export interface AiRuntimeExecuteFunctionCallOptions extends AiRuntimeTranslateFunctionCallOptions {
  readonly run: AiRuntimeFunctionCallRunner
  readonly validate?: AiRuntimeFunctionCallValidator | undefined
  readonly normalizeResult?: AiRuntimeFunctionCallResultNormalizer | undefined
  readonly errorFix?: string | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

export interface AiRuntimeCreateFunctionResultMessageOptions {
  readonly action: AiRuntimeAction
  readonly result: AiRuntimeFunctionCallResult<unknown>
}

export interface AiRuntimeOptions {
  readonly now?: (() => number) | undefined
}

export type AiRegisteredModuleStartSessionOptions = Omit<AiRuntimeStartSessionOptions, 'moduleId'>
export type AiRegisteredModuleStopSessionOptions = Omit<AiRuntimeStopSessionOptions, 'moduleId'>
export type AiRegisteredModuleProjectKnowledgeOptions = Omit<AiRuntimeProjectKnowledgeOptions, 'moduleId'>
export type AiRegisteredModuleAppendMessageOptions = Omit<AiRuntimeAppendMessageOptions, 'moduleId'>
export type AiRegisteredModuleAppendFunctionCallOptions = Omit<AiRuntimeAppendFunctionCallOptions, 'moduleId'>
export type AiRegisteredModuleRecordFunctionCallRequestOptions = Omit<AiRuntimeRecordFunctionCallRequestOptions, 'moduleId'>
export type AiRegisteredModuleCompleteFunctionCallOptions = Omit<AiRuntimeCompleteFunctionCallOptions, 'moduleId'>
export type AiRegisteredModuleTranslateFunctionCallOptions = Omit<AiRuntimeTranslateFunctionCallOptions, 'moduleId'>
export type AiRegisteredModuleExecuteFunctionCallOptions = Omit<AiRuntimeExecuteFunctionCallOptions, 'moduleId'>

export interface AiRegisteredModuleApi {
  readonly moduleId: AiRuntimeModuleId
  readonly registration: AiModuleRegistration
  getRegistration(): AiModuleRegistration
  getRegistrationData(): AiModuleRegistrationData
  getRegistrationStoreSnapshot(): AiModuleRegistrationStoreSnapshot
  getSession(moduleInstanceId: AiRuntimeModuleInstanceId): AiRuntimeSessionRecord | null
  listSessions(): readonly AiRuntimeSessionRecord[]
  getSessionHistory(moduleInstanceId: AiRuntimeModuleInstanceId): readonly AiRuntimeHistoryEntry[]
  appendMessage(options: AiRegisteredModuleAppendMessageOptions): AiRuntimeMessageHistoryEntry
  recordFunctionCallRequest(options: AiRegisteredModuleRecordFunctionCallRequestOptions): AiRuntimeFunctionCallHistoryEntry
  completeFunctionCall(options: AiRegisteredModuleCompleteFunctionCallOptions): AiRuntimeFunctionCallHistoryEntry
  appendFunctionCall(options: AiRegisteredModuleAppendFunctionCallOptions): AiRuntimeFunctionCallHistoryEntry
  startSession(options: AiRegisteredModuleStartSessionOptions): Promise<AiRuntimeStartSessionResult>
  stopSession(options: AiRegisteredModuleStopSessionOptions): AiRuntimeStopSessionResult
  projectKnowledge(options: AiRegisteredModuleProjectKnowledgeOptions): Promise<AiRuntimeKnowledgeProjection>
  translateFunctionCall(options: AiRegisteredModuleTranslateFunctionCallOptions): Promise<AiRuntimeFunctionCallTranslationResult>
  executeFunctionCall(options: AiRegisteredModuleExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallResult<unknown>>
  createFunctionResultMessage(options: AiRuntimeCreateFunctionResultMessageOptions): AiRuntimeFunctionResultMessage
}

export interface AiRuntimeApi {
  registerModule(source: AiModuleRegistration | AiModuleRegistrationData | AiModuleRegistrationStoreSnapshot): AiRegisteredModuleApi
  getKnowledgeProjection(): unknown
}
