/**
 * @packageDocumentation
 *
 * 模块语义协议 host 适配 — 会话仓储。
 *
 * 协议层无状态;但 AiHostBusinessRuntime 契约要求维护 session 表
 * (SSE streamKey、history 回放、生命周期都依赖)。本仓储仅在 host 适配层
 * 内为每个 (moduleId, moduleInstanceId) 维护:
 *
 * - 会话状态(status / startedAt / updatedAt / stoppedAt / reason)
 * - history 条目(message / functionCall),按 seq 递增
 * - latestProjection 快照(供 listSessions / getSession 回放)
 *
 * 历史条目 id 遵循旧 ledger 形态: `{instanceId}:history:{seq}`。
 * 所有对外返回均为深拷贝,防止外部修改内部状态。
 */

import type {
  AiRuntimeFunctionCallFailure,
  AiRuntimeFunctionCallHistoryEntry,
  AiRuntimeFunctionCallHistoryStatus,
  AiRuntimeFunctionResultMessage,
  AiRuntimeHistoryEntry,
  AiRuntimeKnowledgeProjection,
  AiRuntimeMessageHistoryEntry,
  AiRuntimeMessageRole,
  AiRuntimeMessageSource,
  AiRuntimeSessionRecord,
  AiRuntimeSessionStatus,
} from '../../protocol/runtime-contracts'

/** 会话主键(moduleId + moduleInstanceId)。 */
interface SessionScopeKey {
  readonly moduleId: string
  readonly moduleInstanceId: string
  readonly instanceId: string
  readonly runtimeInstanceId: string
}

/** 启动会话参数。 */
export interface ModuleSemanticStartSessionOptions extends SessionScopeKey {
  readonly reason?: string | undefined
  readonly projection?: AiRuntimeKnowledgeProjection | undefined
}

/** 追加消息参数。 */
export interface ModuleSemanticAppendMessageOptions extends SessionScopeKey {
  readonly role: AiRuntimeMessageRole
  readonly source?: AiRuntimeMessageSource | undefined
  readonly content: string
  readonly metadata?: Record<string, unknown> | undefined
}

/** 追加函数调用参数。 */
export interface ModuleSemanticAppendFunctionCallOptions extends SessionScopeKey {
  readonly action: string
  readonly args: unknown
  readonly status?: AiRuntimeFunctionCallHistoryStatus | undefined
  readonly result?: unknown
  readonly resultMessage?: AiRuntimeFunctionResultMessage | undefined
  readonly error?: AiRuntimeFunctionCallFailure | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

/** 内部会话条目(可变),返回时深拷贝为 AiRuntimeSessionRecord。 */
interface MutableSession {
  readonly moduleId: string
  readonly moduleInstanceId: string
  readonly instanceId: string
  readonly runtimeInstanceId: string
  status: AiRuntimeSessionStatus
  startedAt: number
  updatedAt: number
  stoppedAt?: number
  reason?: string
  latestProjection?: AiRuntimeKnowledgeProjection
  history: AiRuntimeHistoryEntry[]
}

/** 时间源,可注入用于测试。 */
export interface ModuleSemanticSessionStoreOptions {
  readonly now?: (() => number) | undefined
}

/**
 * 模块语义协议 host 适配 — 会话仓储。
 *
 * 设计目标:
 * - 协议本身不维护状态,host 适配在这里维护一份等价 AiSessionLedger
 *   的最小数据结构,但只覆盖 ModuleSemanticBusinessRuntime 用到的字段。
 * - 不复用 AiSessionLedger,因为 ledger 与旧注册/翻译器深度耦合(scope 校验、
 *   翻译器依赖等),module-semantic 不需要这些层级。
 */
export class ModuleSemanticSessionStore {
  private readonly sessions = new Map<string, MutableSession>()

  private nextHistorySeq = 1

  private readonly now: () => number

  public constructor(options: ModuleSemanticSessionStoreOptions = {}) {
    this.now = options.now ?? Date.now
  }

  /**
   * 启动或复用会话。若已存在则更新状态为 Started 并保留历史。
   */
  public startSession(options: ModuleSemanticStartSessionOptions): AiRuntimeSessionRecord {
    const key = sessionKey(options.moduleId, options.moduleInstanceId)
    const existing = this.sessions.get(key)
    const ts = this.now()
    if (existing === undefined) {
      const session: MutableSession = {
        moduleId: options.moduleId,
        moduleInstanceId: options.moduleInstanceId,
        instanceId: options.instanceId,
        runtimeInstanceId: options.runtimeInstanceId,
        status: 'Started',
        startedAt: ts,
        updatedAt: ts,
        ...(options.reason === undefined ? {} : { reason: options.reason }),
        ...(options.projection === undefined ? {} : { latestProjection: options.projection }),
        history: [],
      }
      this.sessions.set(key, session)
      return cloneSession(session)
    }
    existing.status = 'Started'
    existing.updatedAt = ts
    if (options.reason !== undefined) existing.reason = options.reason
    if (options.projection !== undefined) existing.latestProjection = options.projection
    delete existing.stoppedAt
    return cloneSession(existing)
  }

  /**
   * 停止会话。session 不存在时返回 null。
   */
  public stopSession(
    moduleId: string,
    moduleInstanceId: string,
    reason?: string,
  ): AiRuntimeSessionRecord | null {
    const session = this.sessions.get(sessionKey(moduleId, moduleInstanceId))
    if (session === undefined) return null
    const ts = this.now()
    session.status = 'Stopped'
    session.stoppedAt = ts
    session.updatedAt = ts
    if (reason !== undefined) session.reason = reason
    return cloneSession(session)
  }

  /**
   * 获取会话记录(深拷贝)。
   */
  public getSession(moduleId: string, moduleInstanceId: string): AiRuntimeSessionRecord | null {
    const session = this.sessions.get(sessionKey(moduleId, moduleInstanceId))
    return session === undefined ? null : cloneSession(session)
  }

  /**
   * 列出所有会话(深拷贝),按 startedAt 升序。
   */
  public listSessions(): readonly AiRuntimeSessionRecord[] {
    return [...this.sessions.values()]
      .sort((a, b) => a.startedAt - b.startedAt)
      .map((session) => cloneSession(session))
  }

  /**
   * 获取会话 history(深拷贝)。会话不存在返回空数组。
   */
  public getSessionHistory(
    moduleId: string,
    moduleInstanceId: string,
  ): readonly AiRuntimeHistoryEntry[] {
    const session = this.sessions.get(sessionKey(moduleId, moduleInstanceId))
    if (session === undefined) return []
    return session.history.map((entry) => cloneHistoryEntry(entry))
  }

  /**
   * 追加消息条目。返回新增条目(深拷贝)。
   */
  public appendMessage(options: ModuleSemanticAppendMessageOptions): AiRuntimeMessageHistoryEntry {
    const session = this.requireSession(options.moduleId, options.moduleInstanceId)
    const ts = this.now()
    const entry: AiRuntimeMessageHistoryEntry = {
      moduleId: options.moduleId,
      moduleInstanceId: options.moduleInstanceId,
      instanceId: options.instanceId,
      runtimeInstanceId: options.runtimeInstanceId,
      id: this.nextHistoryId(options.instanceId),
      seq: this.nextHistorySeq - 1,
      timestamp: ts,
      kind: 'message',
      role: options.role,
      source: options.source ?? defaultSource(options.role),
      content: options.content,
      ...(options.metadata === undefined ? {} : { metadata: cloneJson(options.metadata) }),
    }
    session.history.push(entry)
    session.updatedAt = ts
    return cloneMessageEntry(entry)
  }

  /**
   * 追加函数调用条目(任意状态)。
   */
  public appendFunctionCall(
    options: ModuleSemanticAppendFunctionCallOptions,
  ): AiRuntimeFunctionCallHistoryEntry {
    const session = this.requireSession(options.moduleId, options.moduleInstanceId)
    const ts = this.now()
    const status: AiRuntimeFunctionCallHistoryStatus = options.status ?? (
      options.error !== undefined ? 'failed' : 'completed'
    )
    const entry: AiRuntimeFunctionCallHistoryEntry = {
      moduleId: options.moduleId,
      moduleInstanceId: options.moduleInstanceId,
      instanceId: options.instanceId,
      runtimeInstanceId: options.runtimeInstanceId,
      id: this.nextHistoryId(options.instanceId),
      seq: this.nextHistorySeq - 1,
      timestamp: ts,
      kind: 'functionCall',
      action: options.action,
      args: cloneUnknown(options.args),
      status,
      ...(status !== 'requested' ? { completedAt: ts } : {}),
      ...(options.result === undefined ? {} : { result: cloneUnknown(options.result) }),
      ...(options.resultMessage === undefined ? {} : { resultMessage: cloneResultMessage(options.resultMessage) }),
      ...(options.error === undefined ? {} : { error: { ...options.error } }),
      ...(options.metadata === undefined ? {} : { metadata: cloneJson(options.metadata) }),
    }
    session.history.push(entry)
    session.updatedAt = ts
    return cloneFunctionCallEntry(entry)
  }

  /**
   * 更新会话的 latestProjection(供后续 listSessions 查询)。
   */
  public updateProjection(
    moduleId: string,
    moduleInstanceId: string,
    projection: AiRuntimeKnowledgeProjection,
  ): void {
    const session = this.sessions.get(sessionKey(moduleId, moduleInstanceId))
    if (session === undefined) return
    session.latestProjection = projection
    session.updatedAt = this.now()
  }

  /**
   * 释放某个 moduleInstanceId 的全部会话(host 调用 releaseModuleInstance)。
   */
  public releaseModuleInstance(moduleInstanceId: string): void {
    const targets: string[] = []
    for (const [key, session] of this.sessions.entries()) {
      if (session.moduleInstanceId === moduleInstanceId) targets.push(key)
    }
    for (const key of targets) this.sessions.delete(key)
  }

  private requireSession(moduleId: string, moduleInstanceId: string): MutableSession {
    const session = this.sessions.get(sessionKey(moduleId, moduleInstanceId))
    if (session === undefined) {
      throw new Error(
        `[ModuleSemanticSessionStore] session not found for module ${moduleId}/${moduleInstanceId}; call startSession first.`,
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

// ═══════════════════════════════════════════════════════
// 内部辅助
// ═══════════════════════════════════════════════════════

function sessionKey(moduleId: string, moduleInstanceId: string): string {
  return `${moduleId} ${moduleInstanceId}`
}

function defaultSource(role: AiRuntimeMessageRole): AiRuntimeMessageSource {
  switch (role) {
    case 'user': return 'ui'
    case 'assistant': return 'llm'
    case 'system': return 'system'
  }
}

function cloneSession(session: MutableSession): AiRuntimeSessionRecord {
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
    ...(session.latestProjection === undefined ? {} : { latestProjection: session.latestProjection }),
    history: session.history.map((entry) => cloneHistoryEntry(entry)),
  }
}

function cloneHistoryEntry(entry: AiRuntimeHistoryEntry): AiRuntimeHistoryEntry {
  return entry.kind === 'message'
    ? cloneMessageEntry(entry)
    : cloneFunctionCallEntry(entry)
}

function cloneMessageEntry(entry: AiRuntimeMessageHistoryEntry): AiRuntimeMessageHistoryEntry {
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
    ...(entry.metadata === undefined ? {} : { metadata: cloneJson(entry.metadata) }),
  }
}

function cloneFunctionCallEntry(entry: AiRuntimeFunctionCallHistoryEntry): AiRuntimeFunctionCallHistoryEntry {
  return {
    moduleId: entry.moduleId,
    moduleInstanceId: entry.moduleInstanceId,
    instanceId: entry.instanceId,
    runtimeInstanceId: entry.runtimeInstanceId,
    id: entry.id,
    seq: entry.seq,
    timestamp: entry.timestamp,
    kind: 'functionCall',
    action: entry.action,
    args: cloneUnknown(entry.args),
    status: entry.status,
    ...(entry.completedAt === undefined ? {} : { completedAt: entry.completedAt }),
    ...(entry.result === undefined ? {} : { result: cloneUnknown(entry.result) }),
    ...(entry.resultMessage === undefined ? {} : { resultMessage: cloneResultMessage(entry.resultMessage) }),
    ...(entry.error === undefined ? {} : { error: { ...entry.error } }),
    ...(entry.modulePath === undefined ? {} : { modulePath: entry.modulePath }),
    ...(entry.functionId === undefined ? {} : { functionId: entry.functionId }),
    ...(entry.activePath === undefined ? {} : { activePath: cloneJson(entry.activePath) as AiRuntimeFunctionCallHistoryEntry['activePath'] }),
    ...(entry.metadata === undefined ? {} : { metadata: cloneJson(entry.metadata) }),
  }
}

function cloneResultMessage(message: AiRuntimeFunctionResultMessage): AiRuntimeFunctionResultMessage {
  return {
    action: message.action,
    result: cloneUnknown(message.result) as AiRuntimeFunctionResultMessage['result'],
    content: message.content,
  }
}

function cloneJson<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}

function cloneUnknown(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return value
  }
}
