/**
 * ═══════════════════════════════════════════════════════════════
 * host/business/business-types.ts — 业务注册与作用域类型定义
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】Host 层的类型基石。定义了从业务注册→会话作用域→生命周期回调
 *   的完整类型链。所有 Host 组件都依赖本文件的类型。
 *
 * 【类型层次】
 *   AiHostBusinessTarget    — 业务定位（registrationId + instanceId）
 *     └─ AiHostBusinessScope — 业务作用域（继承 Target，增加 instanceId）
 *          └─ AiHostBusinessRuntimeContext — 运行时上下文（精简版 Scope）
 *   AiHostBusinessRegistration        — 业务注册项（持有 runtime + 回调）
 *   AiHostBusinessRegistrationOptions — 注册选项（构造函数入参形状）
 *   AiHostOptions                     — Host 全局配置（registry + transport）
 *
 * 【生命周期回调】
 *   onStartSession(context)          — 会话启动时调用
 *   afterFunctionCall(options)       — 每次工具调用后调用，返回 lifecycleDirective
 *   onEndBusinessInstance(context,d) — 业务实例结束时调用
 *   releaseModuleInstance(id)        — 释放模块实例资源
 *
 * 【消费方】business-registry、business-session、business-scope、tool-loop-runner
 * ═══════════════════════════════════════════════════════════════
 */

import type { ModuleSemanticRuntime } from '../../module-semantic/runtime/module-semantic-runtime'
import type { LlmJsonValue } from '../../schema'
import type { AiHostChatRequest } from '../chat/chat-types'
import type {
  AiHostFunctionCallResult,
  AiHostMessageRole,
  AiHostMessageSource,
  AiHostSessionStore,
} from '../session/session-types'
import type { AiHostTransport } from '../transport/transport-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 业务定位与作用域
// ═══════════════════════════════════════════════════════════════

/**
 * 业务定位键。
 * businessRegistrationId — 业务注册 ID（如 "page-design"）
 * businessInstanceId     — 业务实例 ID（如页面 ID）
 */
export class AiHostBusinessTarget {
  public constructor(
    public readonly businessRegistrationId: string,
    public readonly businessInstanceId: string,
  ) {}
}

/**
 * 业务作用域（继承 Target，增加实例级标识）。
 * instanceId        — 会话实例 ID（通常 = registrationId:instanceId）
 * runtimeInstanceId — 运行时实例 ID（与 instanceId 相同，保留给未来扩展）
 */
export class AiHostBusinessScope extends AiHostBusinessTarget {
  public constructor(
    businessRegistrationId: string,
    businessInstanceId: string,
    public readonly instanceId: string,
    public readonly runtimeInstanceId: string,
  ) {
    super(businessRegistrationId, businessInstanceId)
  }
}

/**
 * 运行时上下文（精简版 Scope，传递给 ModuleSemanticRuntime.executeTool）。
 * moduleId         — 业务模块 ID
 * moduleInstanceId — 模块实例 ID
 * instanceId       — 会话实例 ID
 */
export class AiHostBusinessRuntimeContext {
  public constructor(
    public readonly moduleId: string,
    public readonly moduleInstanceId: string,
    public readonly instanceId: string,
  ) {}
}

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 消息追加选项
// ═══════════════════════════════════════════════════════════════

/** 向 sessionStore 追加一条消息的参数 */
export type AiHostBusinessAppendMessageOptions = AiHostBusinessRuntimeContext & Readonly<{
  role: AiHostMessageRole
  content: string
  source?: AiHostMessageSource | undefined
  metadata?: Record<string, unknown> | undefined
}>

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 生命周期控制
// ═══════════════════════════════════════════════════════════════

/** 生命周期状态：继续 | 完成 | 终止 */
export type AiHostBusinessLifecycleStatus = 'continue' | 'complete' | 'abort'

/**
 * 生命周期指令（afterFunctionCall 的返回值）。
 * status               — continue/complete/abort
 * reason               — 结束原因（可选）
 * finalAssistantMessage — 最终给用户的消息（可选）
 * releaseInstance       — 是否释放业务实例资源（可选）
 */
export type AiHostBusinessLifecycleDirective = Readonly<{
  status: AiHostBusinessLifecycleStatus
  reason?: string | undefined
  finalAssistantMessage?: string | undefined
  releaseInstance?: boolean | undefined
}>

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 工具调用后回调选项
// ═══════════════════════════════════════════════════════════════

/** afterFunctionCall 回调的参数 */
export type AiHostBusinessAfterFunctionCallOptions = AiHostBusinessRuntimeContext & Readonly<{
  toolName: string
  args: Readonly<Record<string, LlmJsonValue>>
  result: AiHostFunctionCallResult<unknown>
}>

// ═══════════════════════════════════════════════════════════════
// 第 5 节 · 业务注册
// ═══════════════════════════════════════════════════════════════

/**
 * 业务注册选项（AiHostBusinessRegistration 构造函数入参）。
 *
 * 必填：
 *   moduleId  — 模块 ID
 *   name      — 展示名
 *   description — 描述（会拼入 systemPrompt）
 *   runtime   — ModuleSemanticRuntime 实例
 *
 * 可选：
 *   sessionStore         — 会话存储实现（默认 DefaultAiHostSessionStore）
 *   systemPrompt         — 自定义系统提示词工厂
 *   afterFunctionCall    — 工具调用后生命周期回调
 *   onStartSession       — 会话启动回调
 *   onEndBusinessInstance — 业务实例结束回调
 *   releaseModuleInstance — 释放模块实例资源
 */
export type AiHostBusinessRegistrationOptions = Readonly<{
  moduleId: string
  name: string
  description: string
  runtime: ModuleSemanticRuntime
  sessionStore?: AiHostSessionStore | undefined
  systemPrompt?: ((context: AiHostBusinessRuntimeContext) => string | undefined) | undefined
  afterFunctionCall?: (
    options: AiHostBusinessAfterFunctionCallOptions,
  ) => AiHostBusinessLifecycleDirective | Promise<AiHostBusinessLifecycleDirective>
  onStartSession?: (context: AiHostBusinessRuntimeContext) => void | Promise<void>
  onEndBusinessInstance?: (
    context: AiHostBusinessRuntimeContext,
    directive: AiHostBusinessLifecycleDirective,
  ) => void | Promise<void>
  releaseModuleInstance?: (moduleInstanceId: string) => void
}>

/**
 * 业务注册项。
 *
 * 【与 ModuleSemanticRuntime 的关系】
 *   一个 Registration 持有一个 ModuleSemanticRuntime 实例，
 *   该 runtime 上注册了业务方定义的所有 ModuleKind。
 *   Host 工具循环通过 runtime.executeTool() 调用协议工具。
 */
export class AiHostBusinessRegistration {
  public readonly moduleId: string
  public readonly name: string
  public readonly description: string
  public readonly runtime: ModuleSemanticRuntime
  public readonly sessionStore?: AiHostSessionStore | undefined
  public readonly systemPrompt?: ((context: AiHostBusinessRuntimeContext) => string | undefined) | undefined
  public readonly afterFunctionCall?: (
    options: AiHostBusinessAfterFunctionCallOptions,
  ) => AiHostBusinessLifecycleDirective | Promise<AiHostBusinessLifecycleDirective>
  public readonly onStartSession?: (context: AiHostBusinessRuntimeContext) => void | Promise<void>
  public readonly onEndBusinessInstance?: (
    context: AiHostBusinessRuntimeContext,
    directive: AiHostBusinessLifecycleDirective,
  ) => void | Promise<void>
  public readonly releaseModuleInstance?: (moduleInstanceId: string) => void

  public constructor(options: AiHostBusinessRegistrationOptions) {
    this.moduleId = options.moduleId
    this.name = options.name
    this.description = options.description
    this.runtime = options.runtime
    if (options.sessionStore !== undefined) this.sessionStore = options.sessionStore
    if (options.systemPrompt !== undefined) this.systemPrompt = options.systemPrompt
    if (options.afterFunctionCall !== undefined) this.afterFunctionCall = options.afterFunctionCall
    if (options.onStartSession !== undefined) this.onStartSession = options.onStartSession
    if (options.onEndBusinessInstance !== undefined) this.onEndBusinessInstance = options.onEndBusinessInstance
    if (options.releaseModuleInstance !== undefined) this.releaseModuleInstance = options.releaseModuleInstance
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 6 节 · Host 全局配置
// ═══════════════════════════════════════════════════════════════

/**
 * Host 全局配置。
 * registry      — 业务注册表（查询 + 列举）
 * transport     — AI 传输层（fetch/SSE）
 * maxToolRounds — 最大工具调用轮次（防止无限循环）
 */
export type AiHostOptions = Readonly<{
  registry: {
    get(moduleId: string): AiHostBusinessRegistration | undefined
    list(): readonly AiHostBusinessRegistration[]
  }
  transport: AiHostTransport
  maxToolRounds?: number | undefined
}>

/** 消息发送器签名：接收请求，返回 Promise<void> */
export type AiHostSender = (request: AiHostChatRequest) => Promise<void>
