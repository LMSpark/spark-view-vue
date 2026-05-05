/**
 * Core function protocol.
 *
 * Address format is always `business@module@function`.
 * Core owns only function metadata, runtime trace, and execution contracts.
 * Business state is created and managed by business modules.
 */

export type FunctionKind = 'request' | 'describe'

export interface PostValidationWarning {
  rule: string
  detail: string
  fix?: string
}

export type FunctionResult<T = unknown> =
  | { ok: true; data: T; summary: string; warnings?: PostValidationWarning[] }
  | { ok: false; code: string; msg: string; fix: string }

export interface FunctionFailureMode {
  code: string
  when: string
  fix: string
}

export interface FunctionTraceEntry {
  action: string
  requestId: string
  timestamp: number
  summary: string
}

export interface FunctionRuntimeContext {
  patchLog: FunctionTraceEntry[]
}

export type FunctionGuard = (context: FunctionRuntimeContext) => { code: string; msg: string } | null

export interface RegisteredFunctionDefinition<TParams = unknown, TResult = unknown> {
  /** Function address, formatted as `business@module@function`. */
  action: string
  type: FunctionKind
  description: string
  modulePrompt?: string
  guard?: FunctionGuard
  guardDescription?: string
  usageRules?: string[]
  paramsSchema?: Record<string, unknown>
  resultSchema?: Record<string, unknown>
  example?: Record<string, unknown>
  failureModes?: FunctionFailureMode[]
  validate(params: TParams): string | null
  execute(context: FunctionRuntimeContext, params: TParams): FunctionResult<TResult>
  postValidate?(context: FunctionRuntimeContext, params: TParams): PostValidationWarning[]
}

export function createFunctionRuntimeContext(): FunctionRuntimeContext {
  return { patchLog: [] }
}

export const noGuard: FunctionGuard = () => null