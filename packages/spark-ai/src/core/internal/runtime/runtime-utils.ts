import type {
  AiRuntimeAction,
  AiRuntimeFunctionCallFailure,
  AiRuntimeFunctionCallResult,
  AiRuntimeFunctionContextParam,
  AiRuntimeInstanceScope,
  AiRuntimeProjectKnowledgeOptions,
} from '../../protocol/runtime-contracts'
import { AiInvocationProtocol } from '../invocation-helpers'

/** 克隆 runtime 对外返回值，避免调用方修改 core 保存的 session/history 快照。 */
export function cloneRuntimeValue<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') return value
  try {
    return globalThis.structuredClone(value)
  } catch {
    try {
      return JSON.parse(JSON.stringify(value)) as T
    } catch {
      return value
    }
  }
}

export function assertNonEmptyId(kind: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${kind} must not be empty`)
  }
}

export function assertRuntimeId(kind: string, value: string): void {
  assertNonEmptyId(kind, value)
  if (value.includes('/') || value.includes('@')) {
    throw new Error(`${kind} must not contain / or @: ${value}`)
  }
}

export function moduleScopeKey(moduleId: string, moduleInstanceId: string): string {
  return `${moduleId}\u0000${moduleInstanceId}`
}

export function actionOf(
  modulePath: string,
  functionId: string,
  scope: AiRuntimeInstanceScope,
  contextParams: readonly AiRuntimeFunctionContextParam[],
): AiRuntimeAction {
  const modulePathParts = modulePath.split('/')
  const moduleId = modulePathParts[modulePathParts.length - 1] ?? modulePath
  const instancePath = actionInstancePath(scope, contextParams)
  return `${instancePath}@${moduleId}@${functionId}`
}

function actionInstancePath(
  scope: AiRuntimeProjectKnowledgeOptions,
  contextParams: ReadonlyArray<{ modulePath: string; paramName: string }>,
): string {
  if (contextParams.length === 0) return encodeActionInstanceSegment(scope.moduleInstanceId)
  return contextParams.map((param) => (
    param.modulePath === scope.moduleId ? encodeActionInstanceSegment(scope.moduleInstanceId) : `{${param.paramName}}`
  )).join('/')
}

function encodeActionInstanceSegment(instanceId: string): string {
  return encodeURIComponent(instanceId)
}

export function defaultMessageSource(role: 'system' | 'user' | 'assistant'): 'system' | 'ui' | 'llm' {
  if (role === 'user') return 'ui'
  if (role === 'assistant') return 'llm'
  return 'system'
}

export function createFunctionCallFailure(code: string, msg: string, fix: string): AiRuntimeFunctionCallFailure {
  return { ok: false, code, msg, fix }
}

export function normalizeFunctionCallResult(value: unknown, action: string): AiRuntimeFunctionCallResult<unknown> {
  if (isFunctionCallResult(value)) return value
  return {
    ok: true,
    data: value,
    summary: `${action} executed`,
  }
}

function isFunctionCallResult(value: unknown): value is AiRuntimeFunctionCallResult<unknown> {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return false
  const candidate = value as Partial<AiRuntimeFunctionCallResult<unknown>>
  if (candidate.ok === true) {
    return 'data' in candidate && typeof candidate.summary === 'string'
  }
  if (candidate.ok === false) {
    return typeof candidate.code === 'string'
      && typeof candidate.msg === 'string'
      && typeof candidate.fix === 'string'
  }
  return false
}

export function stringifyFunctionResult(result: unknown): string {
  return AiInvocationProtocol.stringifyFunctionResult(result)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
