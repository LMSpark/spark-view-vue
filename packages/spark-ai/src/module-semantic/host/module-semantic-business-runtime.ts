/**
 * @packageDocumentation
 *
 * 模块语义协议 host 适配 — 业务运行时。
 *
 * 把 ModuleSemanticRuntime(协议层,无状态)挂到 AiHostBusinessRuntime
 * 契约上,让旧 AiHostToolLoopRunner / AiHostFetchTransport / SSE 传输
 * 可以原样复用。
 *
 * 职责:
 * - 启动/停止/查询会话:委托 ModuleSemanticSessionStore
 * - 追加消息 / 函数调用记录:委托 ModuleSemanticSessionStore
 * - executeFunctionCall:把 host 的 action 字符串路由到 runtime.executeTool
 * - 知识投影:把 ModuleSemanticToolSpec[] 转成 AiRuntimeFunctionExposure[],
 *   保证旧 tool-loop 内部 new AiRuntimeToolCodec(projection) 能正常生成 tools
 *
 * action 字符串约定:
 * - 直接是协议工具名(getAttribute / setAttribute / invokeAction /
 *   listChildren / findInstance / describeKind)
 * - 不走旧 host 的 `<rootInstance>@<module>@<action>` 形态,因为协议没有
 *   "模块 × 函数"的笛卡尔积
 *
 * 结果映射:
 * - OperationResult.ok=true  → AiRuntimeFunctionCallResult.ok=true,
 *   data = result.data,summary 取首条 info/warn check 的 message
 * - OperationResult.ok=false → AiRuntimeFunctionCallResult.ok=false,
 *   code/msg/fix 取首条 error 级 check;若无 error 级 check,
 *   使用通用 PROTOCOL_FAILURE 兜底
 */

import type {
  AiHostBusinessAfterFunctionCallOptions,
  AiHostBusinessAppendMessageOptions,
  AiHostBusinessExecuteFunctionCallOptions,
  AiHostBusinessLifecycleDirective,
  AiHostBusinessRuntime,
  AiHostBusinessRuntimeContext,
} from '../../host/types'
import type {
  AiRuntimeFunctionCallFailure,
  AiRuntimeFunctionCallResult,
  AiRuntimeFunctionExposure,
  AiRuntimeHistoryEntry,
  AiRuntimeKnowledgeProjection,
  AiRuntimeMessageHistoryEntry,
  AiRuntimeModuleExposure,
  AiRuntimeSessionRecord,
  AiRuntimeStartSessionResult,
} from '../../protocol/runtime-contracts'
import type { LlmJsonValue } from '../../protocol/parameter-schema'
import type { ModuleSemanticToolSpec } from '../internal/protocol-tool-generator'
import type { CheckEntry, OperationResult } from '../protocol/operation-result'
import type {
  ModuleSemanticRuntime,
  ProtocolToolArgs,
} from '../runtime/module-semantic-runtime'
import { ModuleSemanticSessionStore } from './module-semantic-session-store'

/** business runtime 构造选项。 */
export interface ModuleSemanticBusinessRuntimeOptions {
  /** 模块注册 ID;旧 host 用 scope.businessRegistrationId 查询 registry 时按此匹配。 */
  readonly moduleId: string

  /** 显示名称,用于 module exposure 中的 name 字段。 */
  readonly name?: string | undefined

  /** 模块描述,用于 module exposure 中的 description / promptSnapshot。 */
  readonly description?: string | undefined

  /** 模块语义协议运行时实例(无状态)。 */
  readonly runtime: ModuleSemanticRuntime

  /** 可选注入的会话仓储(测试可注入,带 now 时间源)。 */
  readonly sessionStore?: ModuleSemanticSessionStore | undefined

  /**
   * 系统 prompt 生成器(可选)。返回 undefined 时回退到 projection.promptSnapshot。
   */
  readonly systemPrompt?: ((context: AiHostBusinessRuntimeContext) => string | undefined) | undefined

  /**
   * 函数调用后的生命周期回调(可选)。
   */
  readonly afterFunctionCall?: (
    options: AiHostBusinessAfterFunctionCallOptions,
  ) => AiHostBusinessLifecycleDirective | Promise<AiHostBusinessLifecycleDirective>

  /**
   * 业务实例结束钩子(可选)。
   */
  readonly endBusinessInstance?: (
    context: AiHostBusinessRuntimeContext,
    directive: AiHostBusinessLifecycleDirective,
  ) => void | Promise<void>
}

/**
 * 模块语义协议 host 适配 — 业务运行时。
 *
 * 实现 AiHostBusinessRuntime 契约,把 host 层的会话与工具调用桥接到
 * 协议层 ModuleSemanticRuntime,同时维护一份 host 用的 session/history。
 */
export class ModuleSemanticBusinessRuntime implements AiHostBusinessRuntime {
  public readonly moduleId: string

  private readonly displayName: string

  private readonly description: string

  private readonly runtime: ModuleSemanticRuntime

  private readonly sessions: ModuleSemanticSessionStore

  private readonly systemPromptProvider?: ((context: AiHostBusinessRuntimeContext) => string | undefined) | undefined

  private readonly afterFunctionCallHandler?: ((
    options: AiHostBusinessAfterFunctionCallOptions,
  ) => AiHostBusinessLifecycleDirective | Promise<AiHostBusinessLifecycleDirective>) | undefined

  private readonly endBusinessInstanceHandler?: ((
    context: AiHostBusinessRuntimeContext,
    directive: AiHostBusinessLifecycleDirective,
  ) => void | Promise<void>) | undefined

  public constructor(options: ModuleSemanticBusinessRuntimeOptions) {
    this.moduleId = options.moduleId
    this.displayName = options.name ?? options.moduleId
    this.description = options.description ?? `Module semantic runtime for ${options.moduleId}`
    this.runtime = options.runtime
    this.sessions = options.sessionStore ?? new ModuleSemanticSessionStore()
    if (options.systemPrompt !== undefined) this.systemPromptProvider = options.systemPrompt
    if (options.afterFunctionCall !== undefined) this.afterFunctionCallHandler = options.afterFunctionCall
    if (options.endBusinessInstance !== undefined) this.endBusinessInstanceHandler = options.endBusinessInstance
  }

  // ───────── AiHostBusinessRuntime 实现 ─────────

  public getSystemPrompt(context: AiHostBusinessRuntimeContext): string | undefined {
    return this.systemPromptProvider?.(context)
  }

  public startSession(context: AiHostBusinessRuntimeContext): Promise<AiRuntimeStartSessionResult> {
    const projection = this.buildProjection(context)
    const record = this.sessions.startSession({
      moduleId: context.moduleId,
      moduleInstanceId: context.moduleInstanceId,
      instanceId: context.instanceId,
      runtimeInstanceId: context.instanceId,
      projection,
    })
    return Promise.resolve({
      ...projection,
      status: 'Started',
      instanceId: context.instanceId,
      moduleId: context.moduleId,
      moduleInstanceId: context.moduleInstanceId,
      lifecycle: {
        moduleId: record.moduleId,
        moduleInstanceId: record.moduleInstanceId,
        instanceId: record.instanceId,
        runtimeInstanceId: record.runtimeInstanceId,
        status: record.status,
        updatedAt: record.updatedAt,
        ...(record.reason === undefined ? {} : { reason: record.reason }),
      },
      session: record,
    })
  }

  public appendMessage(options: AiHostBusinessAppendMessageOptions): AiRuntimeMessageHistoryEntry {
    return this.sessions.appendMessage({
      moduleId: options.moduleId,
      moduleInstanceId: options.moduleInstanceId,
      instanceId: options.instanceId,
      runtimeInstanceId: options.instanceId,
      role: options.role,
      ...(options.source === undefined ? {} : { source: options.source }),
      content: options.content,
      ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
    })
  }

  public getSession(context: AiHostBusinessRuntimeContext): AiRuntimeSessionRecord | null {
    return this.sessions.getSession(context.moduleId, context.moduleInstanceId)
  }

  public listSessions(): readonly AiRuntimeSessionRecord[] {
    return this.sessions.listSessions()
  }

  public getSessionHistory(context: AiHostBusinessRuntimeContext): readonly AiRuntimeHistoryEntry[] {
    return this.sessions.getSessionHistory(context.moduleId, context.moduleInstanceId)
  }

  public async executeFunctionCall(
    options: AiHostBusinessExecuteFunctionCallOptions,
  ): Promise<AiRuntimeFunctionCallResult<unknown>> {
    const args = toProtocolToolArgs(options.args)
    const operationResult = await this.runtime.executeTool(options.action, args)
    const callResult = toFunctionCallResult(operationResult)

    this.sessions.appendFunctionCall({
      moduleId: options.moduleId,
      moduleInstanceId: options.moduleInstanceId,
      instanceId: options.instanceId,
      runtimeInstanceId: options.instanceId,
      action: options.action,
      args: options.args,
      status: callResult.ok ? 'completed' : 'failed',
      ...(callResult.ok ? { result: callResult.data } : {}),
      ...(callResult.ok ? {} : { error: failureFromCallResult(callResult) }),
    })

    return callResult
  }

  public async afterFunctionCall(
    options: AiHostBusinessAfterFunctionCallOptions,
  ): Promise<AiHostBusinessLifecycleDirective> {
    if (this.afterFunctionCallHandler === undefined) return { status: 'continue' }
    return this.afterFunctionCallHandler(options)
  }

  public async endBusinessInstance(
    context: AiHostBusinessRuntimeContext,
    directive: AiHostBusinessLifecycleDirective,
  ): Promise<void> {
    this.sessions.stopSession(context.moduleId, context.moduleInstanceId, directive.reason)
    if (this.endBusinessInstanceHandler !== undefined) {
      await this.endBusinessInstanceHandler(context, directive)
    }
  }

  public releaseModuleInstance(moduleInstanceId: string): void {
    this.sessions.releaseModuleInstance(moduleInstanceId)
  }

  // ───────── 内部:投影构造 ─────────

  /**
   * 构造一个 host-shaped projection。
   *
   * 关键设计:availableFunctions 由协议工具规约直接转换而来,
   * 让旧 tool-loop 内部的 `new AiRuntimeToolCodec(projection)` 能正常派生 LLM tools。
   *
   * action / moduleId 字段:
   * - action 直接用协议工具名(`invokeAction` 等),tool-loop 再经 codec.actionOf()
   *   反查到的就是同一个字符串
   * - moduleId 复用 this.moduleId,这样 codec 生成的 toolName 形如
   *   `ai_<idx>_<moduleId>_<protocolToolName>`,LLM 看到的工具名稳定
   */
  private buildProjection(context: AiHostBusinessRuntimeContext): AiRuntimeKnowledgeProjection {
    const specs = this.runtime.getLlmTools()
    const moduleExposure: AiRuntimeModuleExposure = {
      moduleId: this.moduleId,
      modulePath: this.moduleId,
      moduleIds: [this.moduleId],
      name: this.displayName,
      description: this.description,
      functions: specs.map((spec) => toFunctionExposure(spec, this.moduleId)),
      modules: [],
    }
    return {
      scope: {
        moduleId: context.moduleId,
        moduleInstanceId: context.moduleInstanceId,
        instanceId: context.instanceId,
        runtimeInstanceId: context.instanceId,
      },
      module: moduleExposure,
      promptSnapshot: this.description,
      availableFunctions: moduleExposure.functions,
    }
  }
}

// ═══════════════════════════════════════════════════════
// 内部辅助
// ═══════════════════════════════════════════════════════

function toFunctionExposure(spec: ModuleSemanticToolSpec, moduleId: string): AiRuntimeFunctionExposure {
  return {
    action: spec.function.name,
    moduleId,
    modulePath: moduleId,
    moduleIds: [moduleId],
    description: spec.function.description,
    paramsSchema: spec.function.parameters,
    contextParams: [],
  }
}

function toProtocolToolArgs(value: unknown): ProtocolToolArgs {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const record = value satisfies object
  const result: Record<string, LlmJsonValue> = {}
  for (const [key, raw] of Object.entries(record)) {
    const coerced = coerceLlmJsonValue(raw)
    if (coerced !== undefined) result[key] = coerced
  }
  return result
}

function coerceLlmJsonValue(value: unknown): LlmJsonValue | undefined {
  if (value === null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value
  if (typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    const out: LlmJsonValue[] = []
    for (const item of value) {
      const coerced = coerceLlmJsonValue(item)
      if (coerced !== undefined) out.push(coerced)
    }
    return out
  }
  const record = value satisfies object
  const obj: Record<string, LlmJsonValue> = {}
  for (const [k, v] of Object.entries(record)) {
    const coerced = coerceLlmJsonValue(v)
    if (coerced !== undefined) obj[k] = coerced
  }
  return obj
}

function toFunctionCallResult(result: OperationResult<LlmJsonValue>): AiRuntimeFunctionCallResult<unknown> {
  if (result.ok) {
    const summary = firstInfoOrWarnSummary(result.checks)
    return {
      ok: true,
      ...(result.data === undefined ? {} : { data: result.data }),
      ...(summary === undefined ? {} : { summary }),
    }
  }
  const failure = pickFirstErrorCheck(result.checks)
  if (failure === undefined) {
    return {
      ok: false,
      code: 'PROTOCOL_FAILURE',
      msg: '协议层返回失败但未携带 error 级 check',
      fix: '请检查协议层 OperationResult.checks 是否正确填充',
    }
  }
  return {
    ok: false,
    code: failure.code,
    msg: failure.message,
    fix: failure.hint ?? '请根据 message 调整调用方式或参数',
  }
}

function firstInfoOrWarnSummary(checks: readonly CheckEntry[] | undefined): string | undefined {
  if (checks === undefined) return undefined
  for (const check of checks) {
    if (check.level === 'info' || check.level === 'warn') return check.message
  }
  return undefined
}

function pickFirstErrorCheck(checks: readonly CheckEntry[] | undefined): CheckEntry | undefined {
  if (checks === undefined) return undefined
  for (const check of checks) {
    if (check.level === 'error') return check
  }
  return undefined
}

function failureFromCallResult(result: AiRuntimeFunctionCallResult<unknown>): AiRuntimeFunctionCallFailure {
  if (result.ok) {
    throw new Error('[ModuleSemanticBusinessRuntime] failureFromCallResult called with success result')
  }
  return { ok: false, code: result.code, msg: result.msg, fix: result.fix }
}
