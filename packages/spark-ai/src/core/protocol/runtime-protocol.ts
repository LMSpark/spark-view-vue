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
  AiRuntimeRecordFunctionCallRequestOptions,
  AiRuntimeStartSessionOptions,
  AiRuntimeStopSessionOptions,
} from './session-events'

export type {
  AiRuntimeFunctionId,
  AiRuntimeModuleId,
  AiRuntimeModuleInstanceId,
  AiRuntimeModulePath,
}

export type AiRuntimeAction = string

export type AiRuntimeInstanceScope = {
  readonly moduleId: AiRuntimeModuleId
  readonly moduleInstanceId: AiRuntimeModuleInstanceId
  readonly instanceId: string
  readonly runtimeInstanceId: string
}

export type AiModuleInstanceBinding = {
  readonly modulePath: AiRuntimeModulePath
  readonly instanceId: AiRuntimeModuleInstanceId
  readonly paramName?: string | undefined
}

export type AiRuntimeActivePathSnapshot = {
  readonly instanceId: string
  readonly bindings: readonly AiModuleInstanceBinding[]
  readonly moduleInstances: Readonly<Record<string, string>>
}

export type FunctionExecutionContext = AiRuntimeInstanceScope & {
  readonly modulePath: AiRuntimeModulePath
  readonly moduleIds: readonly string[]
  readonly functionId: AiRuntimeFunctionId
  readonly action: AiRuntimeAction
  readonly moduleInstances: Readonly<Record<string, string>>
  readonly activePath: AiRuntimeActivePathSnapshot
}

export type AiRuntimeFunctionContextParam = {
  readonly modulePath: AiRuntimeModulePath
  readonly moduleId: AiRuntimeModuleId
  readonly paramName: string
  readonly description: string
}

export type AiRuntimeFunctionExposure = {
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

export type AiRuntimeModuleExposure = {
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

export type AiRuntimeKnowledgeProjection = {
  readonly scope: AiRuntimeInstanceScope
  readonly module: AiRuntimeModuleExposure
  readonly promptSnapshot: string
  readonly availableFunctions: readonly AiRuntimeFunctionExposure[]
}

export type AiRuntimeFunctionCallFailure = {
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

export type AiRuntimeFunctionResultMessage = {
  readonly action: AiRuntimeAction
  readonly result: AiRuntimeFunctionCallResult<unknown>
  readonly content: string
}

export type AiRuntimeFunctionCallTranslation = {
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

export type AiRuntimeProjectKnowledgeOptions = AiRuntimeInstanceScope & {}

export type AiRuntimeTranslateFunctionCallOptions = AiRuntimeProjectKnowledgeOptions & {
  readonly action: AiRuntimeAction
  readonly args: unknown
  readonly activePath?: readonly AiModuleInstanceBinding[] | undefined
  readonly projection?: AiRuntimeKnowledgeProjection | undefined
}

export type AiRuntimeFunctionCallRunInput = {
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

export type AiRuntimeExecuteFunctionCallOptions = AiRuntimeTranslateFunctionCallOptions & {
  readonly run: AiRuntimeFunctionCallRunner
  readonly validate?: AiRuntimeFunctionCallValidator | undefined
  readonly normalizeResult?: AiRuntimeFunctionCallResultNormalizer | undefined
  readonly errorFix?: string | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

export type AiRuntimeCreateFunctionResultMessageOptions = {
  readonly action: AiRuntimeAction
  readonly result: AiRuntimeFunctionCallResult<unknown>
}

export type AiRuntimeOptions = {
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
