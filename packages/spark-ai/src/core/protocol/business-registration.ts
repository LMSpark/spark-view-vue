/**
 * 业务注册协议。
 *
 * 模块注册契约与便捷基类。
 * 注册实现优先继承 class 主路径，不再保留旧 I* 兼容契约。
 */

import type { LlmJsonObject, LlmParameterSchemaRoot } from './parameter-schema'

// ── 基础 ID（foundation，也被 AI host protocol 引用） ──

export type AiRuntimeModuleId = string
export type AiRuntimeModuleInstanceId = string
export type AiRuntimeModulePath = string
export type AiRuntimeFunctionId = string

// ── 函数注册 ──

export interface FunctionFailureMode {
  readonly code: string
  readonly when: string
  readonly fix: string
}

export interface AiFunctionRegistration {
  readonly functionId: AiRuntimeFunctionId
  readonly description: string
  readonly paramsSchema: LlmParameterSchemaRoot
  readonly resultSchema?: LlmJsonObject | undefined
  readonly maxExecutionMs?: number | undefined
  readonly usageRules?: readonly string[] | undefined
  readonly failureModes?: readonly FunctionFailureMode[] | undefined
  readonly scope?: 'collection' | 'instance'
  readonly example?: LlmJsonObject | undefined
}

// ── 实例参数 ──

export interface AiModuleInstanceParam {
  readonly name: string
  readonly description: string
}

// ── 模块注册契约 ──

export interface AiModuleRegistration {
  readonly moduleId: AiRuntimeModuleId
  readonly name: string
  readonly description: string
  readonly prompt?: ModulePromptProvider | undefined
  readonly modules?: readonly AiModuleRegistration[] | undefined
  readonly instanceParam?: AiModuleInstanceParam | undefined
  getFunctions(): readonly AiFunctionRegistration[]
}

// ── 便捷基类 ──

export type ModulePromptProvider = string | {
  bivarianceHack(context: ModulePromptContext): string | null | Promise<string | null>
}['bivarianceHack']

export interface ModulePromptContext {
  readonly moduleId: AiRuntimeModuleId
  readonly moduleInstanceId: AiRuntimeModuleInstanceId
  readonly instanceId: string
  readonly runtimeInstanceId: string
  readonly modulePath: AiRuntimeModulePath
  readonly moduleIds: readonly string[]
}

export abstract class AiModuleRegistrationBase implements AiModuleRegistration {
  protected constructor(
    public readonly moduleId: string,
    public readonly name: string,
    public readonly description: string,
    public readonly prompt?: ModulePromptProvider,
    public readonly modules: readonly AiModuleRegistration[] = [],
    public readonly instanceParam?: AiModuleInstanceParam,
  ) {}

  abstract getFunctions(): readonly AiFunctionRegistration[]
}
