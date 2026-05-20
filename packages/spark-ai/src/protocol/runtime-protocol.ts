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

// 这里不再为 JS 基础类型保留导出别名，直接使用原生类型。

export interface AiRuntimeInstanceScope {
  readonly moduleId: string // 模块标识符
  readonly moduleInstanceId: string // 模块实例标识符
  readonly instanceId: string
  readonly runtimeInstanceId: string
}

export interface AiModuleInstanceBinding {
  readonly modulePath: string // 模块路径
  readonly instanceId: string
  readonly paramName?: string | undefined
}

export interface AiRuntimeActivePathSnapshot {
  readonly instanceId: string
  readonly bindings: readonly AiModuleInstanceBinding[]
  readonly moduleInstances: Readonly<Record<string, string>>
}

export interface FunctionExecutionContext extends AiRuntimeInstanceScope {
  readonly modulePath: string // 模块路径
    readonly moduleIds: readonly string[]
    readonly functionId: string // 函数标识符
    readonly action: string // LLM 工具 action 字符串
    readonly moduleInstances: Readonly<Record<string, string>>
    readonly activePath: AiRuntimeActivePathSnapshot
}

export interface AiRuntimeFunctionContextParam {
  readonly modulePath: string // 模块路径
  readonly moduleId: string // 模块标识符
  readonly paramName: string
  readonly description: string
}

export interface AiRuntimeFunctionExposure {
  readonly action: string // LLM 工具 action 字符串
  readonly moduleId: string // 模块标识符
  readonly modulePath: string // 模块路径
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
  readonly moduleId: string // 模块标识符
  readonly modulePath: string // 模块路径
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
  readonly action: string // LLM 工具 action 字符串
  readonly result: AiRuntimeFunctionCallResult<unknown>
  readonly content: string
}

export interface AiRuntimeFunctionCallTranslation {
  readonly action: string // LLM 工具 action 字符串
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
  readonly action: string // LLM 工具 action 字符串
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

export interface AiRuntimeFunctionCallValidator {
  (input: AiRuntimeFunctionCallRunInput): string | null
}
export interface AiRuntimeFunctionCallRunner {
  (input: AiRuntimeFunctionCallRunInput): unknown
}
export interface AiRuntimeFunctionCallResultNormalizer {
  (value: unknown, input: AiRuntimeFunctionCallRunInput): AiRuntimeFunctionCallResult<unknown>
}

export interface AiRuntimeExecuteFunctionCallOptions extends AiRuntimeTranslateFunctionCallOptions {
  readonly run: AiRuntimeFunctionCallRunner
    readonly validate?: AiRuntimeFunctionCallValidator | undefined
    readonly normalizeResult?: AiRuntimeFunctionCallResultNormalizer | undefined
    readonly errorFix?: string | undefined
    readonly metadata?: Record<string, unknown> | undefined
}

export interface AiRuntimeCreateFunctionResultMessageOptions {
  readonly action: string // LLM 工具 action 字符串
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
