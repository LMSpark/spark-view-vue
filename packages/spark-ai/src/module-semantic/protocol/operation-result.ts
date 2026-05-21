/**
 * @packageDocumentation
 *
 * 模块语义协议 — 操作结果。
 *
 * 协议层所有 ModuleKind 运行入口的统一返回形态。handler 不抛异常打断,
 * 而是把任何错误、警告、提示作为 checks 装进 OperationResult,
 * 由 LLM 自行决定下一步动作。
 *
 * 协议**不**根据 ok 字段做自动重试、回滚、跳路径,只是诚实搬运。
 */

/**
 * 检查项严重等级。
 * - error: handler 因此项而无法完成,LLM 应纠正后重试或换路径
 * - warn:  handler 已完成,但存在副作用或不确定性,LLM 应自行判断
 * - info:  handler 完成,只是提示信息
 */
export type CheckEntryLevel = 'error' | 'warn' | 'info'

/**
 * 单条检查反馈。
 *
 * 字段语义:
 * - level:   严重等级
 * - code:    机器可识别的错误码,如 'NOT_FOUND' / 'INVALID_VALUE' / 'CYCLE_DETECTED'
 * - message: 给 LLM 看的中文描述
 * - hint:    给 LLM 的下一步建议(可选)
 */
export interface CheckEntry {
  readonly level: CheckEntryLevel
  readonly code: string
  readonly message: string
  readonly hint?: string | undefined
}

/**
 * 协议级标准结果对象。
 *
 * 由所有 ModuleKind 运行入口返回,协议透传给 LLM。
 *
 * - ok:     总体成功标志
 * - data:   业务返回值(LLM 可读)
 * - checks: 检查项列表(零或多)
 * - state:  handler 想让 LLM 知道的状态摘要(可选)
 */
export interface OperationResult<TData = unknown> {
  readonly ok: boolean
  readonly data?: TData | undefined
  readonly checks?: readonly CheckEntry[] | undefined
  readonly state?: Record<string, unknown> | undefined
}

/**
 * 构造一个成功结果。
 */
export function ok<TData>(data?: TData, checks?: readonly CheckEntry[]): OperationResult<TData> {
  return {
    ok: true,
    ...(data === undefined ? {} : { data }),
    ...(checks === undefined || checks.length === 0 ? {} : { checks }),
  }
}

/**
 * 构造一个失败结果。
 *
 * 必须至少有一条 error 级 checks,否则 LLM 无法理解失败原因。
 */
export function fail(checks: readonly CheckEntry[]): OperationResult<never> {
  return { ok: false, checks }
}

/**
 * 构造单条 error 检查。
 */
export function errorCheck(code: string, message: string, hint?: string): CheckEntry {
  return hint === undefined
    ? { level: 'error', code, message }
    : { level: 'error', code, message, hint }
}

/**
 * 构造单条 warn 检查。
 */
export function warnCheck(code: string, message: string, hint?: string): CheckEntry {
  return hint === undefined
    ? { level: 'warn', code, message }
    : { level: 'warn', code, message, hint }
}

/**
 * 构造单条 info 检查。
 */
export function infoCheck(code: string, message: string, hint?: string): CheckEntry {
  return hint === undefined
    ? { level: 'info', code, message }
    : { level: 'info', code, message, hint }
}
