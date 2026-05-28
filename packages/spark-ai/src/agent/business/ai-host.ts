/**
 * ═══════════════════════════════════════════════════════════════
 * agent/business/ai-host.ts — AI Host 顶层入口
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】Agent 层的公共门面，是外部系统接入 AI 能力的唯一入口。
 *   位于 agent 层最顶端，向下编排 business-session、business-task、
 *   business-registry 等组件完成"注册 → 运行 → 会话"的完整闭环。
 *
 * 【核心类】
 *   AiAgentHost  — AI 业务宿主编排器
 *     ├─ 持 有 AiAgentRegistry（业务注册表）
 *     ├─ 管理 alias↔moduleId 双向映射
 *     ├─ 提供 register/ensure/has/run 四个公共方法
 *     └─ 委托 runAiAgent() 执 行完整的"task 创建 → session 启动 → 消息发送"流程
 *
 * 【数据流】
 *   1. 外部系统 createAiAgentHost({ turnCallbacks }) → 创建 Host 实例
 *   2. host.register(alias, registration) → 注册业务到内部 registry + 建立别名映射
 *   3. host.run(alias, input) → 解析别名 → 委托 runAiAgent() 创建 task + session + 发送消息
 *   4. runAiAgent 内部调用 session.start() → session.send() → 启动工具循环
 *
 * 【消费方】APP 层初始化代码、页面级 AI 助手入口
 * ═══════════════════════════════════════════════════════════════
 */

import { defineCapability, isCallable, isRecord } from '@spark-view/spark-utils'
import type { AiJsonParams } from '../../json'
import type { AiModuleRuntimeInspectReport } from '../../modules'
import { AiAgentRegistry } from './business-registry'
import { runAiAgent, type AiAgentSession } from './business-session'
import {
  createAiAgentTask,
  type AiAgentOrchestrationPlan,
  type AiAgentTask,
  type AiAgentTaskChatOptions,
} from './business-task'
import type { AiAgentTurnCallbacks } from '../transport/transport-types'
import type { AiAgentRegistration } from './registration-types'
import type { AiAgentOptions } from './host-options'
import type { AiAgentScope } from './scope-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 公共类型 — Host 构造、运行、注册的输入/输出类型
// ═══════════════════════════════════════════════════════════════

/** Host 构造选项：必须提供 turnCallbacks（APP 层 I/O 回调），可选 maxToolRounds 安全阀 */
export type CreateAiAgentHostOptions = Readonly<{
  turnCallbacks: AiAgentTurnCallbacks
  maxToolRounds?: number
}>

/** Host.run() 的返回值：包含创建的 task 和 session */
export type AiAgentHostRunResult = Readonly<{
  task: AiAgentTask
  session: AiAgentSession
}>

/** 泛型注册表映射：alias → registration，供泛型类型推断使用 */
export type AiAgentHostEntryMap = Record<string, AiAgentRegistration>

/** 从 registration 泛型参数中提取输入类型 */
export type AiAgentHostRegistrationInput<TRegistration> =
  TRegistration extends AiAgentRegistration<infer TInput> ? TInput : AiJsonParams

/** ensure 命令：延迟创建 registration 的工厂指令 */
export type AiAgentHostEnsureCommand<TInput extends AiJsonParams = AiJsonParams> = Readonly<{
  moduleId: string
  create: () => AiAgentRegistration<TInput>
}>

export type AiAgentHostRegistrationSummary = Readonly<{
  alias: string
  moduleId: string
  name: string
  description: string
  rootKinds: readonly string[]
  moduleCount: number
  status: AiModuleRuntimeInspectReport['status']
}>

export type AiAgentHostRegistrationDescription = AiAgentHostRegistrationSummary & Readonly<{
  inspectReport: AiModuleRuntimeInspectReport
}>

export type AiAgentHostDryRunResult = Readonly<
  | {
    ok: true
    alias: string
    moduleId: string
    normalizedInput: AiJsonParams
    scope: AiAgentScope
    orchestration: AiAgentOrchestrationPlan
    tools: readonly string[]
    inspectReport: AiModuleRuntimeInspectReport
  }
  | {
    ok: false
    alias: string
    error: Readonly<{
      message: string
    }>
  }
>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 内部状态类型 — Host 实例的运行时状态
// ═══════════════════════════════════════════════════════════════

/** Host 实例的内部状态，包含注册表和别名映射 */
type AiAgentHostState = {
  readonly registry: AiAgentRegistry
  readonly aliasToModuleId: Map<string, string>
  readonly moduleIdToAlias: Map<string, string>
  readonly turnCallbacks: AiAgentTurnCallbacks
  readonly maxToolRounds?: number
}

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · AiAgentHost 类 — AI 业务宿主编排器
// ═══════════════════════════════════════════════════════════════

/**
 * AI 业务宿主编排器。
 *
 * 对外暴露四个核心方法：
 *   register(alias, registration) — 注册一个业务（别名 + 注册项）
 *   ensure(alias, command)        — 幂等注册（已存在则跳过，否则调用 factory 创建）
 *   has(alias)                    — 检查别名是否已注册
 *   run(alias, input, chat?)      — 运行一个已注册业务（创建 task → 启动 session → 发送消息）
 *
 * 泛型参数 TEntries 支持链式类型推断：每次 register/ensure 返回新的类型窄化实例。
 */
export class AiAgentHost<TEntries extends AiAgentHostEntryMap = {}> {
  private readonly state: AiAgentHostState

  private constructor(state: AiAgentHostState) {
    this.state = state
  }

  /** 静态工厂：创建 Host 实例 */
  public static create(options: CreateAiAgentHostOptions): AiAgentHost {
    return new AiAgentHost(createAiAgentHostState(options))
  }

  /**
   * 注册一个业务。
   *
   * 流程：规范化别名 → 查重（重复抛错）→ 写入 registry + 双向映射 → 返回新实例。
   * 返回类型窄化后的新 Host 实例，旧实例不受影响。
   */
  public register<K extends string, TInput extends AiJsonParams>(
    alias: K,
    registration: AiAgentRegistration<TInput>,
  ): AiAgentHost<TEntries & Record<K, AiAgentRegistration<TInput>>> {
    const normalizedAlias = normalizeAlias(alias)
    if (this.state.aliasToModuleId.has(normalizedAlias)) {
      throw new Error(`Duplicate AI host run alias: ${normalizedAlias}`)
    }
    this.state.registry.register(registration)
    this.state.aliasToModuleId.set(normalizedAlias, registration.moduleId)
    this.state.moduleIdToAlias.set(registration.moduleId, normalizedAlias)

    return new AiAgentHost<TEntries & Record<K, AiAgentRegistration<TInput>>>(this.state)
  }

  /**
   * 幂等注册（确保存在）。
   *
   * 三种情况：
   *   1. alias 已绑定到相同 moduleId → 跳过（幂等）
   *   2. alias 已绑定到不同 moduleId → 抛错
   *   3. alias 不存在 → 调用 command.create() 创建并注册
   */
  public ensure<K extends string, TInput extends AiJsonParams>(
    alias: K,
    command: AiAgentHostEnsureCommand<TInput>,
  ): AiAgentHost<TEntries & Record<K, AiAgentRegistration<TInput>>> {
    const normalizedAlias = normalizeAlias(alias)
    const moduleId = normalizeRequiredText(command.moduleId, 'moduleId')
    const existingModuleId = this.state.aliasToModuleId.get(normalizedAlias)
    if (existingModuleId !== undefined) {
      if (existingModuleId !== moduleId) {
        throw new Error(`AI host run alias "${normalizedAlias}" is already bound to moduleId "${existingModuleId}", not "${moduleId}".`)
      }
      return new AiAgentHost<TEntries & Record<K, AiAgentRegistration<TInput>>>(this.state)
    }

    const existingAlias = this.state.moduleIdToAlias.get(moduleId)
    if (existingAlias !== undefined) {
      throw new Error(`AI host business moduleId "${moduleId}" is already bound to alias "${existingAlias}".`)
    }
    if (this.state.registry.get(moduleId) !== undefined) {
      throw new Error(`AI host business moduleId "${moduleId}" is already registered without alias "${normalizedAlias}".`)
    }

    const registration = command.create()
    if (registration.moduleId !== moduleId) {
      throw new Error(`AI agent ensure moduleId mismatch: expected "${moduleId}", got "${registration.moduleId}".`)
    }
    return this.register(alias, registration)
  }

  /** 检查别名是否已注册 */
  public has(alias: string): boolean {
    return this.state.aliasToModuleId.has(normalizeAlias(alias))
  }

  /** 列出 Host 当前暴露的业务入口，用于启动日志、控制台和接入自检。 */
  public listRegistrations(): readonly AiAgentHostRegistrationSummary[] {
    const summaries: AiAgentHostRegistrationSummary[] = []
    for (const [alias, moduleId] of this.state.aliasToModuleId.entries()) {
      const registration = this.state.registry.get(moduleId)
      if (registration === undefined) continue
      summaries.push(summarizeRegistration(alias, registration))
    }
    return summaries
  }

  /** 查看单个 alias 的注册详情和 runtime.inspect() 结果。 */
  public describe(alias: string): AiAgentHostRegistrationDescription | undefined {
    const normalizedAlias = normalizeAlias(alias)
    const moduleId = this.state.aliasToModuleId.get(normalizedAlias)
    if (moduleId === undefined) return undefined
    const registration = this.state.registry.get(moduleId)
    if (registration === undefined) return undefined
    const inspectReport = registration.runtime.inspect()
    return {
      ...summarizeRegistration(normalizedAlias, registration, inspectReport),
      inspectReport,
    }
  }

  /** 删除一个 alias 及其绑定的业务注册项，主要用于测试、热更新和调试面板。 */
  public unregister(alias: string): AiAgentHost {
    const normalizedAlias = normalizeAlias(alias)
    const moduleId = this.state.aliasToModuleId.get(normalizedAlias)
    if (moduleId === undefined) return new AiAgentHost(this.state)
    this.state.aliasToModuleId.delete(normalizedAlias)
    this.state.moduleIdToAlias.delete(moduleId)
    this.state.registry.delete(moduleId)
    return new AiAgentHost(this.state)
  }

  /** 只验证注册、输入契约、scope、orchestration 和工具清单，不调用 LLM。 */
  public dryRun(alias: string, args: unknown): AiAgentHostDryRunResult {
    try {
      const normalizedAlias = normalizeAlias(alias)
      const moduleId = this.state.aliasToModuleId.get(normalizedAlias)
      if (moduleId === undefined) {
        throw new Error(`AI host run alias is not registered: ${normalizedAlias}`)
      }
      const registration = this.state.registry.get(moduleId)
      if (registration === undefined) {
        throw new Error(`AI host business moduleId is not registered: ${moduleId}`)
      }
      const task = createAiAgentTask(this.state.registry, moduleId, args)
      return {
        ok: true,
        alias: normalizedAlias,
        moduleId,
        normalizedInput: task.normalizedInput,
        scope: task.scope,
        orchestration: task.orchestration,
        tools: registration.runtime.getTools().map((tool) => tool.function.name),
        inspectReport: registration.runtime.inspect(),
      }
    } catch (error) {
      return {
        ok: false,
        alias,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      }
    }
  }

  /**
   * 运行一个已注册业务。
   *
   * 这是外部系统触发 AI 能力的主入口。
   * 流程：解析 alias → 查找 moduleId → 委托 runAiAgent() 执行完整的
   * "创建 task → 启动 session → 发送首轮消息" 流程。
   */
  public async run<K extends keyof TEntries & string>(
    alias: K,
    args: AiAgentHostRegistrationInput<TEntries[K]>,
    chat?: AiAgentTaskChatOptions,
  ): Promise<AiAgentHostRunResult>
  public async run<TInput extends AiJsonParams = AiJsonParams>(
    alias: string,
    args: TInput,
    chat?: AiAgentTaskChatOptions,
  ): Promise<AiAgentHostRunResult>
  public async run(
    alias: string,
    args: AiJsonParams,
    chat?: AiAgentTaskChatOptions,
  ): Promise<AiAgentHostRunResult> {
    const normalizedAlias = normalizeAlias(alias)
    const moduleId = this.state.aliasToModuleId.get(normalizedAlias)
    if (moduleId === undefined) {
      throw new Error(`AI host run alias is not registered: ${normalizedAlias}`)
    }
    return runAiAgent({
      options: this.createRunOptions(),
      kindID: moduleId,
      input: args,
      ...(chat === undefined ? {} : { chat }),
    })
  }

  /** 从当前 Host 状态构造 AiAgentOptions（注入 registry + turnCallbacks） */
  private createRunOptions(): AiAgentOptions {
    const options: AiAgentOptions = {
      registry: this.state.registry,
      turnCallbacks: this.state.turnCallbacks,
    }
    if (this.state.maxToolRounds !== undefined) {
      return { ...options, maxToolRounds: this.state.maxToolRounds }
    }
    return options
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 工厂函数与 Capability 定义
// ═══════════════════════════════════════════════════════════════

/** AI Host 的 capability 标记常量 */
export const AI_AGENT_HOST = defineCapability<AiAgentHost>('spark:capability:ai-agent-host', isAiAgentHost)

/** 便捷工厂：创建 AiAgentHost 实例 */
export function createAiAgentHost(options: CreateAiAgentHostOptions): AiAgentHost {
  return AiAgentHost.create(options)
}

// ═══════════════════════════════════════════════════════════════
// 第 5 节 · 内部辅助函数 — 状态创建、类型守卫、字符串规范化
// ═══════════════════════════════════════════════════════════════

/** 从 CreateAiAgentHostOptions 构造内部状态对象 */
function createAiAgentHostState(options: CreateAiAgentHostOptions): AiAgentHostState {
  const state: AiAgentHostState = {
    registry: new AiAgentRegistry(),
    aliasToModuleId: new Map<string, string>(),
    moduleIdToAlias: new Map<string, string>(),
    turnCallbacks: options.turnCallbacks,
  }
  if (options.maxToolRounds !== undefined) {
    return { ...state, maxToolRounds: options.maxToolRounds }
  }
  return state
}

function summarizeRegistration(
  alias: string,
  registration: AiAgentRegistration,
  report = registration.runtime.inspect(),
): AiAgentHostRegistrationSummary {
  return {
    alias,
    moduleId: registration.moduleId,
    name: registration.name,
    description: registration.description,
    rootKinds: report.rootKinds,
    moduleCount: report.moduleCount,
    status: report.status,
  }
}

/** 类型守卫：判断一个值是否为 AiAgentHost 实例（通过 duck typing 检测四个方法） */
function isAiAgentHost(value: unknown): value is AiAgentHost {
  if (!isRecord(value)) return false
  return isCallable(value['register'])
    && isCallable(value['ensure'])
    && isCallable(value['has'])
    && isCallable(value['run'])
}

/** 规范化别名：trim + 禁止首尾空白 */
function normalizeAlias(value: string): string {
  const normalized = normalizeRequiredText(value, 'alias')
  if (normalized !== value) {
    throw new Error('AI host alias must not include surrounding whitespace.')
  }
  return normalized
}

/** 规范化必填文本字段：非空字符串 + 去空白 */
function normalizeRequiredText(value: string, fieldName: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`AI host ${fieldName} must not be empty.`)
  }
  return trimmed
}
