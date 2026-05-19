/**
 * 业务注册协议。
 *
 * 模块/业务注册契约、持久化快照结构、便捷基类。
 * 新注册实现优先继承 class 主路径；I* 契约仅作为公共兼容类型保留。
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

// ── 模块注册基础接口 ──

export interface IModuleRegistration {
  readonly moduleId: string
  readonly name: string
  readonly entity: Record<string, () => unknown>
  readonly prompt: string
  readonly functions: readonly AiFunctionRegistration[]
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

// ── 业务注册契约 ──

export interface IBusinessRegistration extends IModuleRegistration {
  readonly businessId: AiRuntimeModuleId
  readonly modules?: readonly AiModuleRegistration[] | undefined
  readonly instanceParam?: AiModuleInstanceParam | undefined
}

// ── 纯数据快照（可 JSON 序列化落库） ──

export interface AiModuleRegistrationData {
  readonly moduleId: AiRuntimeModuleId
  readonly name: string
  readonly description: string
  readonly prompt?: string | undefined
  readonly instanceParam?: AiModuleInstanceParam | undefined
  readonly functions: readonly AiFunctionRegistration[]
  readonly modules: readonly AiModuleRegistrationData[]
}

export interface IBusinessRegistrationData {
  readonly businessId: AiRuntimeModuleId
  readonly name: string
  readonly description: string
  readonly prompt?: string | undefined
  readonly instanceParam?: AiModuleInstanceParam | undefined
  readonly functions: readonly AiFunctionRegistration[]
  readonly modules: readonly AiModuleRegistrationData[]
}

// ── 结构化持久化快照行 ──

export interface AiModuleRegistrationStoreModule {
  readonly modulePath: AiRuntimeModulePath
  readonly parentModulePath?: AiRuntimeModulePath | undefined
  readonly moduleId: AiRuntimeModuleId
  readonly sortOrder: number
  readonly name: string
  readonly description: string
  readonly prompt?: string | undefined
  readonly instanceParamName?: string | undefined
  readonly instanceParamDescription?: string | undefined
}

export interface AiFunctionRegistrationStoreFunction {
  readonly modulePath: AiRuntimeModulePath
  readonly functionId: AiRuntimeFunctionId
  readonly sortOrder: number
  readonly description: string
  readonly paramsSchema: LlmParameterSchemaRoot
  readonly resultSchema?: LlmJsonObject | undefined
  readonly maxExecutionMs?: number | undefined
  readonly scope?: 'collection' | 'instance'
}

export interface AiFunctionRegistrationUsageRule {
  readonly modulePath: AiRuntimeModulePath
  readonly functionId: AiRuntimeFunctionId
  readonly sortOrder: number
  readonly rule: string
}

export interface AiFunctionRegistrationFailureMode {
  readonly modulePath: AiRuntimeModulePath
  readonly functionId: AiRuntimeFunctionId
  readonly sortOrder: number
  readonly code: string
  readonly when: string
  readonly fix: string
}

// ── 结构化持久化快照 ──

export interface AiModuleRegistrationStoreSnapshot {
  readonly rootModulePath: AiRuntimeModulePath
  readonly modules: readonly AiModuleRegistrationStoreModule[]
  readonly functions: readonly AiFunctionRegistrationStoreFunction[]
  readonly usageRules: readonly AiFunctionRegistrationUsageRule[]
  readonly failureModes: readonly AiFunctionRegistrationFailureMode[]
}

export interface IBusinessRegistrationStoreSnapshot extends AiModuleRegistrationStoreSnapshot {
  readonly rootBusinessPath: AiRuntimeModulePath
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
