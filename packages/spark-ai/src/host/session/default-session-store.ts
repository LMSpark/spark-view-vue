/**
 * In-memory Host session store.
 *
 * Host records UI/LLM messages, protocol tool calls, and lifecycle state.
 * Business release clears live state only; it does not delete this history.
 */

import type { AiHostBusinessAppendMessageOptions, AiHostBusinessRuntimeContext } from '../business/business-types'
import {
  AiHostSessionStore,
  type AiHostAppendFunctionCallOptions,
  type AiHostFunctionCallHistoryEntry,
  type AiHostHistoryEntry,
  type AiHostMessageHistoryEntry,
  type AiHostMessageRole,
  type AiHostMessageSource,
  type AiHostSessionRecord,
} from './session-types'
import { isRecord } from '../transport/http-utils'

export type DefaultAiHostSessionStoreOptions = Readonly<{
  now?: (() => number) | undefined
}>

type MutableSession = {
  readonly moduleId: string
  readonly moduleInstanceId: string
  readonly instanceId: string
  readonly runtimeInstanceId: string
  status: 'Started' | 'Stopped'
  startedAt: number
  updatedAt: number
  stoppedAt?: number
  reason?: string
  history: AiHostHistoryEntry[]
}

export class DefaultAiHostSessionStore extends AiHostSessionStore {
  private readonly sessions = new Map<string, MutableSession>()

  private nextHistorySeq = 1

  private readonly now: () => number

  public constructor(options: DefaultAiHostSessionStoreOptions = {}) {
    super()
    this.now = options.now ?? Date.now
  }

  public startSession(context: AiHostBusinessRuntimeContext): AiHostSessionRecord {
    const key = sessionKey(context)
    const ts = this.now()
    const existing = this.sessions.get(key)
    if (existing !== undefined) {
      existing.status = 'Started'
      existing.updatedAt = ts
      delete existing.stoppedAt
      return cloneSession(existing)
    }
    const session: MutableSession = {
      moduleId: context.moduleId,
      moduleInstanceId: context.moduleInstanceId,
      instanceId: context.instanceId,
      runtimeInstanceId: context.instanceId,
      status: 'Started',
      startedAt: ts,
      updatedAt: ts,
      history: [],
    }
    this.sessions.set(key, session)
    return cloneSession(session)
  }

  public stopSession(context: AiHostBusinessRuntimeContext, reason?: string): AiHostSessionRecord | null {
    const session = this.sessions.get(sessionKey(context))
    if (session === undefined) return null
    const ts = this.now()
    session.status = 'Stopped'
    session.updatedAt = ts
    session.stoppedAt = ts
    if (reason !== undefined) session.reason = reason
    return cloneSession(session)
  }

  public getSession(context: AiHostBusinessRuntimeContext): AiHostSessionRecord | null {
    const session = this.sessions.get(sessionKey(context))
    return session === undefined ? null : cloneSession(session)
  }

  public listSessions(): readonly AiHostSessionRecord[] {
    return [...this.sessions.values()]
      .sort((a, b) => a.startedAt - b.startedAt)
      .map((session) => cloneSession(session))
  }

  public getSessionHistory(context: AiHostBusinessRuntimeContext): readonly AiHostHistoryEntry[] {
    const session = this.sessions.get(sessionKey(context))
    return session === undefined ? [] : session.history.map((entry) => cloneHistoryEntry(entry))
  }

  public appendMessage(options: AiHostBusinessAppendMessageOptions): AiHostMessageHistoryEntry {
    const session = this.requireSession(options)
    const ts = this.now()
    const entry: AiHostMessageHistoryEntry = {
      moduleId: options.moduleId,
      moduleInstanceId: options.moduleInstanceId,
      instanceId: options.instanceId,
      runtimeInstanceId: options.instanceId,
      id: this.nextHistoryId(options.instanceId),
      seq: this.nextHistorySeq - 1,
      timestamp: ts,
      kind: 'message',
      role: options.role,
      source: options.source ?? defaultSource(options.role),
      content: options.content,
      ...(options.metadata === undefined ? {} : { metadata: cloneMetadata(options.metadata) }),
    }
    session.history.push(entry)
    session.updatedAt = ts
    return cloneMessageEntry(entry)
  }

  public appendFunctionCall(options: AiHostAppendFunctionCallOptions): AiHostFunctionCallHistoryEntry {
    const session = this.requireSession(options)
    const ts = this.now()
    const status = options.status ?? (options.error === undefined ? 'completed' : 'failed')
    const entry: AiHostFunctionCallHistoryEntry = {
      moduleId: options.moduleId,
      moduleInstanceId: options.moduleInstanceId,
      instanceId: options.instanceId,
      runtimeInstanceId: options.runtimeInstanceId,
      id: this.nextHistoryId(options.instanceId),
      seq: this.nextHistorySeq - 1,
      timestamp: ts,
      kind: 'functionCall',
      toolName: options.toolName,
      args: cloneUnknown(options.args),
      status,
      ...(status === 'requested' ? {} : { completedAt: ts }),
      ...(options.result === undefined ? {} : { result: cloneUnknown(options.result) }),
      ...(options.error === undefined ? {} : { error: { ...options.error } }),
      ...(options.metadata === undefined ? {} : { metadata: cloneMetadata(options.metadata) }),
    }
    session.history.push(entry)
    session.updatedAt = ts
    return cloneFunctionCallEntry(entry)
  }

  private requireSession(context: AiHostBusinessRuntimeContext): MutableSession {
    const session = this.sessions.get(sessionKey(context))
    if (session === undefined) {
      throw new Error(
        `[DefaultAiHostSessionStore] session not found for ${context.moduleId}/${context.moduleInstanceId}; call startSession first.`,
      )
    }
    return session
  }

  private nextHistoryId(instanceId: string): string {
    const seq = this.nextHistorySeq
    this.nextHistorySeq += 1
    return `${instanceId}:history:${seq}`
  }
}

function sessionKey(context: Pick<AiHostBusinessRuntimeContext, 'moduleId' | 'moduleInstanceId'>): string {
  return `${context.moduleId}\u0000${context.moduleInstanceId}`
}

function defaultSource(role: AiHostMessageRole): AiHostMessageSource {
  switch (role) {
    case 'user': return 'ui'
    case 'assistant': return 'llm'
    case 'system': return 'system'
  }
}

function cloneSession(session: MutableSession): AiHostSessionRecord {
  return {
    moduleId: session.moduleId,
    moduleInstanceId: session.moduleInstanceId,
    instanceId: session.instanceId,
    runtimeInstanceId: session.runtimeInstanceId,
    status: session.status,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    ...(session.stoppedAt === undefined ? {} : { stoppedAt: session.stoppedAt }),
    ...(session.reason === undefined ? {} : { reason: session.reason }),
    history: session.history.map((entry) => cloneHistoryEntry(entry)),
  }
}

function cloneHistoryEntry(entry: AiHostHistoryEntry): AiHostHistoryEntry {
  return entry.kind === 'message' ? cloneMessageEntry(entry) : cloneFunctionCallEntry(entry)
}

function cloneMessageEntry(entry: AiHostMessageHistoryEntry): AiHostMessageHistoryEntry {
  return {
    moduleId: entry.moduleId,
    moduleInstanceId: entry.moduleInstanceId,
    instanceId: entry.instanceId,
    runtimeInstanceId: entry.runtimeInstanceId,
    id: entry.id,
    seq: entry.seq,
    timestamp: entry.timestamp,
    kind: 'message',
    role: entry.role,
    source: entry.source,
    content: entry.content,
    ...(entry.metadata === undefined ? {} : { metadata: cloneMetadata(entry.metadata) }),
  }
}

function cloneFunctionCallEntry(entry: AiHostFunctionCallHistoryEntry): AiHostFunctionCallHistoryEntry {
  return {
    moduleId: entry.moduleId,
    moduleInstanceId: entry.moduleInstanceId,
    instanceId: entry.instanceId,
    runtimeInstanceId: entry.runtimeInstanceId,
    id: entry.id,
    seq: entry.seq,
    timestamp: entry.timestamp,
    kind: 'functionCall',
    toolName: entry.toolName,
    args: cloneUnknown(entry.args),
    status: entry.status,
    ...(entry.completedAt === undefined ? {} : { completedAt: entry.completedAt }),
    ...(entry.result === undefined ? {} : { result: cloneUnknown(entry.result) }),
    ...(entry.error === undefined ? {} : { error: { ...entry.error } }),
    ...(entry.metadata === undefined ? {} : { metadata: cloneMetadata(entry.metadata) }),
  }
}

function cloneMetadata(value: Record<string, unknown>): Record<string, unknown> {
  const cloned = cloneUnknown(value)
  return isRecord(cloned) ? cloned : { ...value }
}

function cloneUnknown(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== 'object') return value
  try {
    const text = JSON.stringify(value)
    return JSON.parse(text)
  } catch {
    return value
  }
}
