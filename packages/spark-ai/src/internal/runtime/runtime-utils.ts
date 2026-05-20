/**
 * Core 运行时工具函数。
 *
 * 无状态纯函数，供 AiSessionLedger / AiProjectionService / AiFunctionCallExecutor 等模块复用。
 *
 * ┌──────────────────────────────────────────────────────┐
 * │               runtime-utils 职责分类                  │
 * │                                                      │
 * │  深拷贝：cloneRuntimeValue()                         │
 * │  ID 校验：assertNonEmptyId() / assertRuntimeId()     │
 * │  缓存键：moduleScopeKey()                            │
 * │  Action 路径：actionOf() / actionInstancePath()      │
 * │  消息源映射：defaultMessageSource()                  │
 * │  函数结果：createFunctionCallFailure()               │
 * │            normalizeFunctionCallResult()             │
 * │            stringifyFunctionResult()                 │
 * │  类型守卫：isFunctionCallResult() / isRecord()       │
 * └──────────────────────────────────────────────────────┘
 */

import type {
  AiRuntimeFunctionCallFailure,
  AiRuntimeFunctionCallResult,
  AiRuntimeFunctionContextParam,
  AiRuntimeInstanceScope,
  AiRuntimeProjectKnowledgeOptions,
} from '../../protocol/runtime-contracts'
import { AiInvocationProtocol } from '../invocation-helpers'

// ── 深拷贝 ──

/** 克隆 runtime 对外返回值，避免调用方修改 core 保存的 session/history 快照。 */
export function cloneRuntimeValue<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') return value
  try {
    return globalThis.structuredClone(value)
  } catch {
    return value
  }
}

// ── ID 校验 ──

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

// ── 缓存键 ──

export function moduleScopeKey(moduleId: string, moduleInstanceId: string): string {
  return `${moduleId}\u0000${moduleInstanceId}`
}

// ── Action 路径生成 ──

export function actionOf(
  modulePath: string,
  functionId: string,
  scope: AiRuntimeInstanceScope,
  contextParams: readonly AiRuntimeFunctionContextParam[],
): string {
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

// ── 消息源映射 ──

export function defaultMessageSource(role: 'system' | 'user' | 'assistant'): 'system' | 'ui' | 'llm' {
  if (role === 'user') return 'ui'
  if (role === 'assistant') return 'llm'
  return 'system'
}

// ── 函数调用结果 ──

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
  if (!isRecord(value)) return false
  if (value['ok'] === true) {
    return 'data' in value && typeof value['summary'] === 'string'
  }
  if (value['ok'] === false) {
    return typeof value['code'] === 'string'
      && typeof value['msg'] === 'string'
      && typeof value['fix'] === 'string'
  }
  return false
}

export function stringifyFunctionResult(result: unknown): string {
  return AiInvocationProtocol.stringifyFunctionResult(result)
}

// ── 类型守卫 ──

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
