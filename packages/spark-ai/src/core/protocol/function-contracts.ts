/**
 * 核心函数协议。
 *
 * 这个文件只定义函数系统最基础的公共约束，供目录层、运行时层和业务层共享：
 * 1. 调用结果、失败语义与后置警告
 * 2. 运行时上下文、追踪记录与前置守卫
 * 3. 目录行与可执行函数定义
 *
 * 函数地址格式固定为 business@module@function。
 * 业务状态由业务模块自行持有，这里不引入任何业务对象。
 */

import type {
  AiCoreAction,
  AiCoreBusinessId,
  AiCoreModuleId,
  FunctionFailureMode,
  PostValidationWarning,
} from './business-contracts'

export type { AiCoreAction, FunctionFailureMode, PostValidationWarning } from './business-contracts'

export type FunctionAction<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
> = AiCoreAction<TBusinessId, TModuleId>

/**
 * 功能分区一：调用结果与失败语义
 * 时序说明：
 * 1. 先约定成功结果、失败结果与后置警告的统一形状
 * 2. 后续运行时执行、目录投影和测试都会复用这一层协议
 */

/**
 * 函数统一返回结果。
 * 输入语义：execute 必须产出这个联合类型，成功分支返回 data 和 summary，失败分支返回 code、msg、fix。
 * 输出语义：运行时据此决定是否继续后置校验、是否写入 patchLog，以及如何向上游返回执行摘要。
 * 调用时机：每次函数执行结束时作为唯一的标准返回值。
 */
export type FunctionResult<T = unknown> =
  | { ok: true; data: T; summary: string; warnings?: PostValidationWarning[] }
  | { ok: false; code: string; msg: string; fix: string }

/**
 * 功能分区二：运行时上下文与执行追踪
 * 时序说明：
 * 1. 每轮函数执行先进入运行时上下文
 * 2. 前置守卫和执行逻辑都从上下文读取共享状态
 * 3. 写请求成功后再把摘要写入追踪日志
 */

/**
 * 单次函数执行的追踪记录。
 * 输入语义：由运行时在写请求成功后，根据 action、requestId 和 summary 组装生成。
 * 输出语义：作为 patchLog 中的稳定日志条目，供后续重复检测、历史追踪和调试使用。
 * 调用时机：request 类型函数成功返回后写入运行时上下文。
 */
export interface FunctionTraceEntry {
  action: FunctionAction
  requestId: string
  timestamp: number
  summary: string
}

/**
 * 运行载体键。
 * 输入语义：用于标识一个函数模块对应的静态运行载体，当前约定使用 business@module。
 * 输出语义：运行时可据此从独立 carrier registry 中读取模块实例、提示词与事件钩子。
 * 调用时机：需要按 action 的前两段定位模块实例、模块提示词或模块事件时使用。
 */
export type FunctionCarrierKey<
  TBusinessId extends AiCoreBusinessId = AiCoreBusinessId,
  TModuleId extends AiCoreModuleId = AiCoreModuleId,
> = `${TBusinessId}@${TModuleId}`

/**
 * FC 前置事件负载。
 * 输入语义：在函数真正进入 guard/validate/execute 之前生成，描述当前请求的最小上下文。
 * 输出语义：供运行载体上的 beforeExecute 钩子进行 Promise 决策或取消执行。
 * 调用时机：仅在异步执行链中、命中某个运行载体后发射。
 */
export interface FunctionBeforeExecuteEvent {
  action: FunctionAction
  carrierKey: FunctionCarrierKey
  params: unknown
}

/**
 * FC 后置事件负载。
 * 输入语义：在函数执行完成后生成，携带本次请求参数和最终结果。
 * 输出语义：供运行载体上的 afterExecute 钩子做结果观测、审计或补充通知。
 * 调用时机：仅在异步执行链中、函数已经产出统一 FunctionResult 后发射。
 */
export interface FunctionAfterExecuteEvent {
  action: FunctionAction
  carrierKey: FunctionCarrierKey
  params: unknown
  result: FunctionResult
}

/**
 * FC 前置决策结果。
 * 输入语义：由运行载体的 beforeExecute 钩子返回。
 * 输出语义：cancelled=false 表示继续执行；cancelled=true 表示在真正调用函数前中止本次运行。
 * 调用时机：异步执行链在发射 before 事件后立即读取该结果并决定是否继续。
 */
export type FunctionBeforeExecuteDecision =
  | { cancelled: false }
  | { cancelled: true; code?: string; msg?: string; fix?: string }

/**
 * 运行载体前置事件钩子。
 * 输入语义：接收当前运行时上下文、所属载体与前置事件负载，可异步做放行或取消决策。
 * 输出语义：返回 null/undefined 等价于不干预；返回取消结果则阻断执行。
 * 调用时机：异步执行链中，在 guard 之前先执行该钩子。
 */
export type FunctionCarrierBeforeExecuteHook<TInstance = unknown> = (args: {
  context: FunctionRuntimeContext
  carrier: FunctionCarrierContract<TInstance>
  event: FunctionBeforeExecuteEvent
}) => Promise<FunctionBeforeExecuteDecision | null | undefined> | FunctionBeforeExecuteDecision | null | undefined

/**
 * 运行载体后置事件钩子。
 * 输入语义：接收当前运行时上下文、所属载体与后置事件负载。
 * 输出语义：仅用于异步通知，不参与结果改写或取消。
 * 调用时机：异步执行链中，函数执行结束并产出最终结果后调用。
 */
export type FunctionCarrierAfterExecuteHook<TInstance = unknown> = (args: {
  context: FunctionRuntimeContext
  carrier: FunctionCarrierContract<TInstance>
  event: FunctionAfterExecuteEvent
}) => Promise<void> | void

/**
 * 运行载体契约。
 * 输入语义：独立描述一个模块级运行载体的标识、提示词、展示说明、静态实例槽位与 FC 前后事件钩子。
 * 输出语义：运行时可基于它获取真实模块实例，并在异步执行链中发射 before/after 事件。
 * 调用时机：业务模块需要以“独立载体”而不是 definition 闭包方式暴露实例时注册到 carrier registry。
 */
export interface FunctionCarrierContract<TInstance = unknown> {
  carrierKey: FunctionCarrierKey
  isPrimary?: boolean
  prompt?: string
  description?: string
  instance: TInstance
  beforeExecute?: FunctionCarrierBeforeExecuteHook<TInstance>
  afterExecute?: FunctionCarrierAfterExecuteHook<TInstance>
}

/**
 * 前置事件发射器。
 * 输入语义：接收命中的运行载体、前置事件负载和当前运行时上下文。
 * 输出语义：返回运行载体的前置决策结果，供异步执行链决定是否取消。
 * 调用时机：异步执行链中，在真正进入 guard/validate/execute 之前调用。
 */
export type FunctionBeforeExecuteEmitter = (
  carrier: FunctionCarrierContract<unknown>,
  event: FunctionBeforeExecuteEvent,
  context: FunctionRuntimeContext,
) => Promise<FunctionBeforeExecuteDecision | null | undefined> | FunctionBeforeExecuteDecision | null | undefined

/**
 * 后置事件发射器。
 * 输入语义：接收命中的运行载体、后置事件负载和当前运行时上下文。
 * 输出语义：发射完成即可，不参与结果改写。
 * 调用时机：异步执行链在得到最终 FunctionResult 后调用。
 */
export type FunctionAfterExecuteEmitter = (
  carrier: FunctionCarrierContract<unknown>,
  event: FunctionAfterExecuteEvent,
  context: FunctionRuntimeContext,
) => Promise<void> | void

/**
 * 函数运行时上下文。
 * 输入语义：由会话入口创建，并在同一轮函数循环中持续复用。
 * 输出语义：为 guard、execute、postValidate 提供共享的执行现场，目前主要承载 patchLog。
 * 调用时机：每次新建函数执行会话时创建，并贯穿后续所有函数调用。
 */
export interface FunctionRuntimeContext {
  patchLog: FunctionTraceEntry[]
  emitBeforeExecute: FunctionBeforeExecuteEmitter
  emitAfterExecute: FunctionAfterExecuteEmitter
}

/**
 * 前置守卫函数。
 * 输入语义：接收当前运行时上下文，自行判断是否满足执行前提。
 * 输出语义：返回 null 表示允许继续执行；返回 code 和 msg 表示立即阻断执行。
 * 调用时机：在 validate 之前执行，用于检查编辑态、宿主绑定等前置条件。
 */
export type FunctionGuard = (context: FunctionRuntimeContext) => { code: string; msg: string } | null

/**
 * 功能分区三：目录行与可执行定义
 * 时序说明：
 * 1. 业务层通常先维护静态目录行
 * 2. 再把目录行装配成真正可执行的函数定义
 * 3. 运行时最终只消费可执行定义，不直接执行目录行
 */

/**
 * 函数目录行的最小公共形状。
 * 输入语义：业务层可先以目录行维护 action、schema、示例和失败模式等静态信息。
 * 输出语义：运行时 builder 可基于这类目录行继续装配出 RegisteredFunctionDefinition。
 * 调用时机：适用于 catalog、payload 投影和方法背书 builder 等“先目录、后执行”的场景。
 */
export interface FunctionCatalogRow {
  action: FunctionAction
  description: string
  /**
   * 最大执行时间（毫秒）。
   * - 0（默认）：同步有界，在当前 FC 轮次内完成并立即返回结果。
   * - 正数/Infinity：异步无界，编排器检测到成功结果后必须暂停循环并触发 onAsk 回调，
   *   由调用方在外部交互完成后以 resumeSessionId 继续。
   * 调用时机：注册函数目录、dispatch 决定是否暂停循环时使用。
   */
  maxExecutionMs?: number
  paramsSchema?: Record<string, unknown>
  resultSchema?: Record<string, unknown>
  example?: Record<string, unknown>
  usageRules?: readonly string[]
  failureModes?: readonly FunctionFailureMode[]
}

/**
 * 可执行函数定义。
 * 输入语义：注册阶段必须提供函数地址、类型、描述，以及 validate 和 execute 这两个核心入口。
 * 输出语义：运行时据此完成前置守卫、参数校验、函数执行和后置校验的完整流水线。
 * 调用时机：函数真正进入 registry 并参与 dispatch 前，必须先整理成这个统一形状。
 */
export interface RegisteredFunctionDefinition<TParams = unknown, TResult = unknown> {
  /** 函数地址，格式固定为 business@module@function。 */
  action: FunctionAction
  /** 面向人和模型的简要功能说明。 */
  description: string
  /**
   * 最大执行时间（毫秒）。0（默认）表示同步有界，在当前轮次内完成；
   * 非零值（如 Infinity）表示异步无界，编排器检测到成功后须暂停循环等待外部交互。
   */
  maxExecutionMs?: number
  /** 可选函数级模块提示词；新模块优先改用运行载体的 prompt 承载模块提示词。 */
  modulePrompt?: string
  /** 可选前置守卫，用于在参数校验之前阻断非法执行时机。 */
  guard?: FunctionGuard
  /** 可选载体注入守卫，用于在有运行载体时读取其静态实例并执行前置条件检查。 */
  guardWithCarrier?: ((context: FunctionRuntimeContext, carrier: unknown) => { code: string; msg: string } | null) | undefined
  /** 守卫失败时的人类可读说明。 */
  guardDescription?: string
  /** 关键调用规则列表，用于知识投影和失败修复提示。 */
  usageRules?: readonly string[]
  /** 参数结构说明，供校验提示和工具定义生成复用。 */
  paramsSchema?: Record<string, unknown>
  /** 返回结构说明，供知识查询和工具定义复用。 */
  resultSchema?: Record<string, unknown>
  /** 典型调用示例，供模型重试或提示词生成参考。 */
  example?: Record<string, unknown>
  /** 静态声明的失败模式目录。 */
  failureModes?: readonly FunctionFailureMode[]
  /** 参数校验入口，返回字符串表示阻断执行。 */
  validate(params: TParams): string | null
  /** 可选载体注入参数校验入口；在命中运行载体时优先于 validate 执行。 */
  validateWithCarrier?: ((params: TParams, carrier: unknown, context: FunctionRuntimeContext) => string | null) | undefined
  /** 主执行入口，负责返回统一的成功或失败结果。 */
  execute(context: FunctionRuntimeContext, params: TParams): FunctionResult<TResult>
  /** 可选载体注入主执行入口；在命中运行载体时优先于 execute 执行。 */
  executeWithCarrier?: ((context: FunctionRuntimeContext, carrier: unknown, params: TParams) => FunctionResult<TResult>) | undefined
  /** 可选后置校验入口，仅在 execute 成功后继续执行。 */
  postValidate?(context: FunctionRuntimeContext, params: TParams): PostValidationWarning[]
}

/**
 * 功能分区四：占位实现
 * 时序说明：
 * 1. 运行时上下文实例工厂位于 runtime/function-runtime-context.ts
 * 2. 未声明 guard 的函数可直接复用默认空守卫
 */

/**
 * 默认空守卫。
 * 输入语义：接收上下文但不读取任何状态。
 * 输出语义：固定返回 null，表示没有任何前置条件阻断。
 * 调用时机：函数不需要 guard，或测试中需要显式声明“永远放行”的守卫时使用。
 */
export const noGuard: FunctionGuard = () => null