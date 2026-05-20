/**
 * 业务注册协议。
 *
 * 模块注册契约与便捷基类。注册实现优先继承 class 主路径。
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │                业务注册契约                               │
 * │                                                           │
 * │  函数注册：FunctionFailureMode / AiFunctionRegistration   │
 * │  实例参数：AiModuleInstanceParam                           │
 * │  模块注册：AiModuleRegistration                            │
 * │  Prompt 提供：ModulePromptProvider / ModulePromptContext  │
 * │  便捷基类：AiModuleRegistrationBase（abstract class）      │
 * └──────────────────────────────────────────────────────────┘
 */

import type { LlmJsonObject, LlmParameterSchemaRoot } from './parameter-schema'

// ═══════════════════════════════════════════════════════
// 1. 函数注册
// ═══════════════════════════════════════════════════════

export interface FunctionFailureMode {
  readonly code: string
  readonly when: string
  readonly fix: string
}

export interface AiFunctionRegistration {
  readonly functionId: string // 函数标识符
  readonly description: string
  readonly paramsSchema: LlmParameterSchemaRoot
  readonly resultSchema?: LlmJsonObject | undefined
  readonly maxExecutionMs?: number | undefined
  readonly usageRules?: readonly string[] | undefined
  readonly failureModes?: readonly FunctionFailureMode[] | undefined
  readonly scope?: 'collection' | 'instance'
  readonly example?: LlmJsonObject | undefined
}

// ═══════════════════════════════════════════════════════
// 2. 实例参数
// ═══════════════════════════════════════════════════════

export interface AiModuleInstanceParam {
  readonly name: string
  readonly description: string
}

// ═══════════════════════════════════════════════════════
// 3. 模块注册契约
// ═══════════════════════════════════════════════════════

export interface AiModuleRegistration {
  readonly moduleId: string
  readonly name: string
  readonly description: string
  readonly prompt?: ModulePromptProvider | undefined
  readonly modules?: readonly AiModuleRegistration[] | undefined
  readonly instanceParam?: AiModuleInstanceParam | undefined
  getFunctions(): readonly AiFunctionRegistration[]
}

// ═══════════════════════════════════════════════════════
// 4. Prompt 提供 & 便捷基类
// ═══════════════════════════════════════════════════════

export type ModulePromptProvider = string | {
  bivarianceHack(context: ModulePromptContext): string | null | Promise<string | null>
}['bivarianceHack']

export interface ModulePromptContext {
  readonly moduleId: string // 模块标识符
  readonly moduleInstanceId: string // 模块实例标识符
  readonly instanceId: string
  readonly runtimeInstanceId: string
  readonly modulePath: string // 模块路径（以 / 分隔的 moduleId 序列）
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
