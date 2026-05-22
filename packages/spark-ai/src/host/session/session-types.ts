/**
 * Host session records and session-store contract.
 */

import type { AiHostBusinessAppendMessageOptions, AiHostBusinessRuntimeContext } from '../business/business-types'
import type { AiHostTransportToolSpec } from '../transport/transport-types'

export type AiHostFunctionCallFailure = Readonly<{
  ok: false
  code: string
  msg: string
  fix: string
}>

export type AiHostFunctionCallResult<TData> = Readonly<{
  ok: true
  data?: TData | undefined
  summary?: string | undefined
}> | AiHostFunctionCallFailure

export type AiHostSessionStatus = 'Started' | 'Stopped'
export type AiHostMessageRole = 'system' | 'user' | 'assistant'
export type AiHostMessageSource = 'system' | 'ui' | 'llm'
export type AiHostFunctionCallHistoryStatus = 'requested' | 'completed' | 'failed'

export type AiHostHistoryEntryBase = Readonly<{
  moduleId: string
  moduleInstanceId: string
  instanceId: string
  runtimeInstanceId: string
  id: string
  seq: number
  timestamp: number
}>

export type AiHostMessageHistoryEntry = AiHostHistoryEntryBase & Readonly<{
  kind: 'message'
  role: AiHostMessageRole
  source: AiHostMessageSource
  content: string
  metadata?: Record<string, unknown> | undefined
}>

export type AiHostFunctionCallHistoryEntry = AiHostHistoryEntryBase & Readonly<{
  kind: 'functionCall'
  toolName: string
  args: unknown
  status: AiHostFunctionCallHistoryStatus
  completedAt?: number | undefined
  result?: unknown
  error?: AiHostFunctionCallFailure | undefined
  metadata?: Record<string, unknown> | undefined
}>

export type AiHostHistoryEntry = AiHostMessageHistoryEntry | AiHostFunctionCallHistoryEntry

export type AiHostSessionRecord = Readonly<{
  moduleId: string
  moduleInstanceId: string
  instanceId: string
  runtimeInstanceId: string
  status: AiHostSessionStatus
  startedAt: number
  updatedAt: number
  stoppedAt?: number | undefined
  reason?: string | undefined
  history: readonly AiHostHistoryEntry[]
}>

export type AiHostStartSessionResult = Readonly<{
  status: 'Started'
  instanceId: string
  moduleId: string
  moduleInstanceId: string
  session: AiHostSessionRecord
  tools: readonly AiHostTransportToolSpec[]
}>

export type AiHostAppendFunctionCallOptions = AiHostBusinessRuntimeContext & Readonly<{
  runtimeInstanceId: string
  toolName: string
  args: unknown
  status?: AiHostFunctionCallHistoryStatus | undefined
  result?: unknown
  error?: AiHostFunctionCallFailure | undefined
  metadata?: Record<string, unknown> | undefined
}>

export abstract class AiHostSessionStore {
  public abstract startSession(context: AiHostBusinessRuntimeContext): AiHostSessionRecord
  public abstract stopSession(context: AiHostBusinessRuntimeContext, reason?: string): AiHostSessionRecord | null
  public abstract getSession(context: AiHostBusinessRuntimeContext): AiHostSessionRecord | null
  public abstract listSessions(): readonly AiHostSessionRecord[]
  public abstract getSessionHistory(context: AiHostBusinessRuntimeContext): readonly AiHostHistoryEntry[]
  public abstract appendMessage(options: AiHostBusinessAppendMessageOptions): AiHostMessageHistoryEntry
  public abstract appendFunctionCall(options: AiHostAppendFunctionCallOptions): AiHostFunctionCallHistoryEntry
}
