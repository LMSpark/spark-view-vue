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

/**
 * 功能分区一：调用结果与失败语义
 * 时序说明：
 * 1. 先声明函数属于写请求还是只读描述
 * 2. 再约定成功结果、失败结果与后置警告的统一形状
 * 3. 后续运行时执行、目录投影和测试都会复用这一层协议
 */

/**
 * 函数种类。
 * 输入语义：作为目录行和可执行定义上的 type 字段取值。
 * 输出语义：request 表示可能产生写副作用，describe 表示只读查询。
 * 调用时机：注册函数目录、生成工具定义、执行后决定是否写入 patchLog 时使用。
 */
export type FunctionKind = 'request' | 'describe'

/**
 * 后置校验警告。
 * 输入语义：由 postValidate 在主执行成功后产出，描述非阻断性问题。
 * 输出语义：调用方可据此继续提示模型或用户进行补救，但不回滚本次成功结果。
 * 调用时机：函数主逻辑 execute 成功、且定义了 postValidate 时附加到成功结果上。
 */
export interface PostValidationWarning {
  rule: string
  detail: string
  fix?: string
}

/**
 * 失败模式目录项。
 * 输入语义：由函数目录预声明可能出现的失败码、触发条件与修复建议。
 * 输出语义：供知识查询、文档投影和模型提示理解函数的失败边界。
 * 调用时机：定义函数目录时静态声明，不参与实际执行分支判断。
 */
export interface FunctionFailureMode {
  code: string
  when: string
  fix: string
}

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
  action: string
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
export type FunctionCarrierKey = string

/**
 * FC 前置事件负载。
 * 输入语义：在函数真正进入 guard/validate/execute 之前生成，描述当前请求的最小上下文。
 * 输出语义：供运行载体上的 beforeExecute 钩子进行 Promise 决策或取消执行。
 * 调用时机：仅在异步执行链中、命中某个运行载体后发射。
 */
export interface FunctionBeforeExecuteEvent {
  action: string
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
  action: string
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
  action: string
  type: FunctionKind
  description: string
  paramsSchema?: Record<string, unknown>
  resultSchema?: Record<string, unknown>
  example?: Record<string, unknown>
  usageRules?: string[]
  failureModes?: FunctionFailureMode[]
}

/**
 * 可执行函数定义。
 * 输入语义：注册阶段必须提供函数地址、类型、描述，以及 validate 和 execute 这两个核心入口。
 * 输出语义：运行时据此完成前置守卫、参数校验、函数执行和后置校验的完整流水线。
 * 调用时机：函数真正进入 registry 并参与 dispatch 前，必须先整理成这个统一形状。
 */
export interface RegisteredFunctionDefinition<TParams = unknown, TResult = unknown> {
  /** 函数地址，格式固定为 business@module@function。 */
  action: string
  /** 函数类型，决定它是写请求还是只读描述。 */
  type: FunctionKind
  /** 面向人和模型的简要功能说明。 */
  description: string
  /** 可选函数级模块提示词；新模块优先改用运行载体的 prompt 承载模块提示词。 */
  modulePrompt?: string
  /** 可选前置守卫，用于在参数校验之前阻断非法执行时机。 */
  guard?: FunctionGuard
  /** 可选载体注入守卫，用于在有运行载体时读取其静态实例并执行前置条件检查。 */
  guardWithCarrier?: ((context: FunctionRuntimeContext, carrier: unknown) => { code: string; msg: string } | null) | undefined
  /** 守卫失败时的人类可读说明。 */
  guardDescription?: string
  /** 关键调用规则列表，用于知识投影和失败修复提示。 */
  usageRules?: string[]
  /** 参数结构说明，供校验提示和工具定义生成复用。 */
  paramsSchema?: Record<string, unknown>
  /** 返回结构说明，供知识查询和工具定义复用。 */
  resultSchema?: Record<string, unknown>
  /** 典型调用示例，供模型重试或提示词生成参考。 */
  example?: Record<string, unknown>
  /** 静态声明的失败模式目录。 */
  failureModes?: FunctionFailureMode[]
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
 * 功能分区四：默认工厂与占位实现
 * 时序说明：
 * 1. 新会话先创建默认运行时上下文
 * 2. 未声明 guard 的函数可直接复用默认空守卫
 */

/**
 * 创建新的函数运行时上下文。
 * 输入语义：无输入。
 * 输出语义：返回一个带空 patchLog 的全新上下文对象。
 * 调用时机：每次开启新的函数执行会话，或测试中需要隔离运行时状态时调用。
 */
export function createFunctionRuntimeContext(): FunctionRuntimeContext {
  return {
    patchLog: [],
    emitBeforeExecute: (carrier, event, context) => carrier.beforeExecute?.({ context, carrier, event }) ?? null,
    emitAfterExecute: (carrier, event, context) => carrier.afterExecute?.({ context, carrier, event }),
  }
}

/**
 * 默认空守卫。
 * 输入语义：接收上下文但不读取任何状态。
 * 输出语义：固定返回 null，表示没有任何前置条件阻断。
 * 调用时机：函数不需要 guard，或测试中需要显式声明“永远放行”的守卫时使用。
 */
export const noGuard: FunctionGuard = () => null