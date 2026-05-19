/**
 * 会话事件协议（UI 侧）。
 *
 * AI 会话记录、历史条目、消息追加、函数调用记录/完成等 UI 交互事件类型。
 */

import type {
  AiRuntimeInstanceScope,
  AiRuntimeActivePathSnapshot,
  AiRuntimeAction,
  AiRuntimeFunctionId,
  AiRuntimeModuleId,
  AiRuntimeModuleInstanceId,
  AiRuntimeModulePath,
  AiRuntimeFunctionCallFailure,
  AiRuntimeFunctionResultMessage,
  AiRuntimeKnowledgeProjection,
} from './runtime-protocol'

// ── 枚举类型 ──

export type AiRuntimeSessionStatus = 'Started' | 'Stopped'

export type AiRuntimeMessageRole = 'system' | 'user' | 'assistant'

export type AiRuntimeMessageSource = 'ui' | 'llm' | 'system'

export type AiRuntimeFunctionCallHistoryStatus = 'requested' | 'completed' | 'failed'

// ── 生命周期快照 ──

export interface AiRuntimeSessionLifecycleSnapshot extends AiRuntimeInstanceScope {
  readonly status: AiRuntimeSessionStatus
  readonly updatedAt?: number | undefined
  readonly reason?: string | undefined
}

// ── 历史条目 ──

export interface AiRuntimeHistoryEntryBase extends AiRuntimeInstanceScope {
  readonly id: string
  readonly seq: number
  readonly timestamp: number
  readonly kind: 'message' | 'functionCall'
}

export interface AiRuntimeMessageHistoryEntry extends AiRuntimeHistoryEntryBase {
  readonly kind: 'message'
  readonly role: AiRuntimeMessageRole
  readonly source: AiRuntimeMessageSource
  readonly content: string
  readonly metadata?: Record<string, unknown> | undefined
}

export interface AiRuntimeFunctionCallHistoryEntry extends AiRuntimeHistoryEntryBase {
  readonly kind: 'functionCall'
  readonly action: AiRuntimeAction
  readonly args: unknown
  readonly status: AiRuntimeFunctionCallHistoryStatus
  readonly completedAt?: number | undefined
  readonly result?: unknown
  readonly resultMessage?: AiRuntimeFunctionResultMessage | undefined
  readonly error?: AiRuntimeFunctionCallFailure | undefined
  readonly modulePath?: AiRuntimeModulePath | undefined
  readonly functionId?: AiRuntimeFunctionId | undefined
  readonly activePath?: AiRuntimeActivePathSnapshot | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

export type AiRuntimeHistoryEntry = AiRuntimeMessageHistoryEntry | AiRuntimeFunctionCallHistoryEntry

// ── 会话记录 ──

export interface AiRuntimeSessionRecord extends AiRuntimeInstanceScope {
  readonly moduleId: AiRuntimeModuleId
  readonly moduleInstanceId: AiRuntimeModuleInstanceId
  readonly status: AiRuntimeSessionStatus
  readonly startedAt: number
  readonly updatedAt: number
  readonly stoppedAt?: number | undefined
  readonly reason?: string | undefined
  readonly latestProjection?: AiRuntimeKnowledgeProjection | undefined
  readonly history: readonly AiRuntimeHistoryEntry[]
}

// ── 追加消息 ──

export interface AiRuntimeAppendMessageOptions extends AiRuntimeInstanceScope {
  readonly role: AiRuntimeMessageRole
  readonly content: string
  readonly source?: AiRuntimeMessageSource | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

// ── 追加函数调用 ──

export interface AiRuntimeAppendFunctionCallOptions extends AiRuntimeInstanceScope {
  readonly action: AiRuntimeAction
  readonly args: unknown
  readonly status?: AiRuntimeFunctionCallHistoryStatus | undefined
  readonly result?: unknown
  readonly resultMessage?: AiRuntimeFunctionResultMessage | undefined
  readonly error?: AiRuntimeFunctionCallFailure | undefined
  readonly modulePath?: AiRuntimeModulePath | undefined
  readonly functionId?: AiRuntimeFunctionId | undefined
  readonly activePath?: AiRuntimeActivePathSnapshot | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

// ── 记录函数调用请求 ──

export interface AiRuntimeRecordFunctionCallRequestOptions extends AiRuntimeInstanceScope {
  readonly action: AiRuntimeAction
  readonly args: unknown
  readonly modulePath?: AiRuntimeModulePath | undefined
  readonly functionId?: AiRuntimeFunctionId | undefined
  readonly activePath?: AiRuntimeActivePathSnapshot | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

// ── 完成函数调用 ──

export interface AiRuntimeCompleteFunctionCallOptions extends AiRuntimeInstanceScope {
  readonly historyEntryId: string
  readonly status?: Extract<AiRuntimeFunctionCallHistoryStatus, 'completed' | 'failed'> | undefined
  readonly result?: unknown
  readonly resultMessage?: AiRuntimeFunctionResultMessage | undefined
  readonly error?: AiRuntimeFunctionCallFailure | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

// ── 会话启动/停止 ──

export interface AiRuntimeStartSessionOptions {
  readonly moduleId: AiRuntimeModuleId
  readonly moduleInstanceId: AiRuntimeModuleInstanceId
  readonly instanceId?: string | undefined
  readonly runtimeInstanceId?: string | undefined
  readonly reason?: string | undefined
}

export interface AiRuntimeStartSessionResult extends AiRuntimeKnowledgeProjection {
  readonly status: 'Started'
  readonly instanceId: string
  readonly moduleId: AiRuntimeModuleId
  readonly moduleInstanceId: AiRuntimeModuleInstanceId
  readonly lifecycle: AiRuntimeSessionLifecycleSnapshot
  readonly session: AiRuntimeSessionRecord
}

export interface AiRuntimeStopSessionOptions {
  readonly moduleId: AiRuntimeModuleId
  readonly moduleInstanceId: AiRuntimeModuleInstanceId
  readonly instanceId?: string | undefined
  readonly reason?: string | undefined
}

export interface AiRuntimeStopSessionResult {
  readonly status: 'Stopped'
  readonly instanceId: string
  readonly moduleId: AiRuntimeModuleId
  readonly moduleInstanceId: AiRuntimeModuleInstanceId
  readonly lifecycle: AiRuntimeSessionLifecycleSnapshot
  readonly session: AiRuntimeSessionRecord
}
