import type {
  AiRuntimeAppendFunctionCallOptions,
  AiRuntimeAppendMessageOptions,
  AiRuntimeCompleteFunctionCallOptions,
  AiRuntimeFunctionCallFailure,
  AiRuntimeFunctionCallHistoryEntry,
  AiRuntimeHistoryEntry,
  AiRuntimeHistoryEntryBase,
  AiRuntimeKnowledgeProjection,
  AiRuntimeMessageHistoryEntry,
  AiRuntimeOptions,
  AiRuntimeProjectKnowledgeOptions,
  AiRuntimeRecordFunctionCallRequestOptions,
  AiRuntimeSessionRecord,
  AiRuntimeStartSessionOptions,
  AiRuntimeStartSessionResult,
  AiRuntimeStopSessionOptions,
  AiRuntimeStopSessionResult,
} from '../../protocol/runtime-contracts'
import {
  assertNonEmptyId,
  cloneRuntimeValue,
  createFunctionCallFailure,
  defaultMessageSource,
  moduleScopeKey,
} from './runtime-utils'

/**
 * AI 会话账本。
 *
 * 职责：内存中管理 AI 会话状态、历史记录和别名映射。
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │                    AiSessionLedger                        │
 * │                                                           │
 * │  会话生命周期：                                            │
 * │    prepareStartScope() → 归一化 scope + 别名校验           │
 * │    startSession()    → 创建 Started 状态会话               │
 * │    stopSession()     → 更新为 Stopped 状态                 │
 * │                                                           │
 * │  会话查询：                                                │
 * │    getSession() / listSessions() / getSessionHistory()    │
 * │    requireStartedSession() / getSessionFailure()          │
 * │    normalizeScope()                                       │
 * │                                                           │
 * │  消息操作：                                                │
 * │    appendMessage()        → 追加消息到历史                 │
 * │    appendFunctionCall()   → 追加函数调用记录               │
 * │    recordFunctionCallRequest()                            │
 * │    completeFunctionCall() → 更新函数调用状态               │
 * │                                                           │
 * │  别名管理：                                                │
 * │    bindSessionAliases()   → instanceId/runtimeInstanceId   │
 * │                           → sessionKey 映射               │
 * │    assertInstanceAliasesAvailable() → 校验别名不冲突       │
 * └──────────────────────────────────────────────────────────┘
 */

export class AiSessionLedger {
  private readonly sessions = new Map<string, AiRuntimeSessionRecord>()

  private readonly sessionScopesByInstanceId = new Map<string, string>()

  private nextHistorySeq = 1

  private readonly now: NonNullable<AiRuntimeOptions['now']>

  constructor(options: AiRuntimeOptions = {}) {
    this.now = options.now ?? Date.now
  }

  // ── 会话查询 ──

  /** 获取指定模块实例的会话记录（深拷贝） */
  getSession(moduleId: string, moduleInstanceId: string): AiRuntimeSessionRecord | null {
    const session = this.sessions.get(moduleScopeKey(moduleId, moduleInstanceId))
    return session === undefined ? null : this.cloneSession(session)
  }

  /** 列出会话（可按 moduleId 过滤） */
  listSessions(moduleId?: string): readonly AiRuntimeSessionRecord[] {
    return Array.from(this.sessions.values())
      .filter((session) => moduleId === undefined || session.moduleId === moduleId)
      .map((session) => this.cloneSession(session))
  }

  /** 获取指定会话的历史记录 */
  getSessionHistory(moduleId: string, moduleInstanceId: string): readonly AiRuntimeHistoryEntry[] {
    const session = this.sessions.get(moduleScopeKey(moduleId, moduleInstanceId))
    return session?.history.map((entry) => this.cloneHistoryEntry(entry)) ?? []
  }

  // ── 消息操作 ──

  /** 追加用户/助手/系统消息到会话历史 */
  appendMessage(options: AiRuntimeAppendMessageOptions): AiRuntimeMessageHistoryEntry {
    const session = this.requireStartedSession(options)
    const timestamp = this.now()
    const entry: AiRuntimeMessageHistoryEntry = {
      ...this.historyEnvelope(session, timestamp, 'message'),
      role: options.role,
      source: options.source ?? defaultMessageSource(options.role),
      content: options.content,
      ...(options.metadata === undefined ? {} : { metadata: cloneRuntimeValue(options.metadata) }),
    }
    this.storeHistoryEntry(session, entry, timestamp)
    return this.cloneHistoryEntry(entry)
  }

  /** 记录函数调用请求（状态: requested） */
  recordFunctionCallRequest(options: AiRuntimeRecordFunctionCallRequestOptions): AiRuntimeFunctionCallHistoryEntry {
    return this.appendFunctionCall({
      ...options,
      status: 'requested',
    })
  }

  /** 更新已有函数调用记录的状态和结果 */
  completeFunctionCall(options: AiRuntimeCompleteFunctionCallOptions): AiRuntimeFunctionCallHistoryEntry {
    const session = this.requireStartedSession(options)
    const index = session.history.findIndex((entry) => entry.id === options.historyEntryId)
    if (index < 0) {
      throw new Error(`Unknown AI function call history entry: ${options.historyEntryId}`)
    }
    const previous = session.history[index]
    if (previous?.kind !== 'functionCall') {
      throw new Error(`AI history entry ${options.historyEntryId} is not a function call`)
    }

    const timestamp = this.now()
    const status = options.status ?? (options.error === undefined ? 'completed' : 'failed')
    const updated: AiRuntimeFunctionCallHistoryEntry = {
      ...previous,
      status,
      completedAt: timestamp,
      ...(options.result === undefined ? {} : { result: cloneRuntimeValue(options.result) }),
      ...(options.resultMessage === undefined ? {} : { resultMessage: cloneRuntimeValue(options.resultMessage) }),
      ...(options.error === undefined ? {} : { error: { ...options.error } }),
      ...(options.metadata === undefined ? {} : { metadata: cloneRuntimeValue(options.metadata) }),
    }
    this.replaceHistoryEntry(session, index, updated, timestamp)
    return this.cloneHistoryEntry(updated)
  }

  /** 追加函数调用记录到历史 */
  appendFunctionCall(options: AiRuntimeAppendFunctionCallOptions): AiRuntimeFunctionCallHistoryEntry {
    const session = this.requireStartedSession(options)
    const timestamp = this.now()
    const entry: AiRuntimeFunctionCallHistoryEntry = {
      ...this.historyEnvelope(session, timestamp, 'functionCall'),
      action: options.action,
      args: cloneRuntimeValue(options.args),
      status: options.status ?? 'completed',
      ...((options.status ?? 'completed') === 'requested' ? {} : { completedAt: timestamp }),
      ...(options.result === undefined ? {} : { result: cloneRuntimeValue(options.result) }),
      ...(options.resultMessage === undefined ? {} : { resultMessage: cloneRuntimeValue(options.resultMessage) }),
      ...(options.error === undefined ? {} : { error: { ...options.error } }),
      ...(options.modulePath === undefined ? {} : { modulePath: options.modulePath }),
      ...(options.functionId === undefined ? {} : { functionId: options.functionId }),
      ...(options.activePath === undefined ? {} : { activePath: cloneRuntimeValue(options.activePath) }),
      ...(options.metadata === undefined ? {} : { metadata: cloneRuntimeValue(options.metadata) }),
    }
    this.storeHistoryEntry(session, entry, timestamp)
    return this.cloneHistoryEntry(entry)
  }

  // ── 会话生命周期 ──

  /**
   * 准备启动会话的 scope。
   * 归一化 instanceId / runtimeInstanceId，校验别名不冲突。
   */
  prepareStartScope(options: AiRuntimeStartSessionOptions): AiRuntimeProjectKnowledgeOptions {
    const previous = this.sessions.get(moduleScopeKey(options.moduleId, options.moduleInstanceId))
    const instanceId = options.instanceId ?? previous?.instanceId ?? options.moduleInstanceId
    const runtimeInstanceId = options.runtimeInstanceId
      ?? (options.instanceId !== undefined ? instanceId : previous?.runtimeInstanceId)
      ?? instanceId
    const scope = this.normalizeScope({
      moduleId: options.moduleId,
      moduleInstanceId: options.moduleInstanceId,
      instanceId,
      runtimeInstanceId,
    })
    this.assertInstanceAliasesAvailable(scope)
    return scope
  }

  /** 创建 Started 状态的会话并存储 */
  startSession(
    scope: AiRuntimeProjectKnowledgeOptions,
    projection: AiRuntimeKnowledgeProjection,
    reason: string | undefined,
  ): AiRuntimeStartSessionResult {
    const previous = this.sessions.get(moduleScopeKey(scope.moduleId, scope.moduleInstanceId))
    this.assertInstanceAliasesAvailable(scope)
    const timestamp = this.now()
    const lifecycle = this.createLifecycleSnapshot(scope, 'Started', reason, timestamp)
    const session = this.createStartedSession(scope, projection, previous, timestamp, reason)
    this.storeSession(session)
    return {
      ...projection,
      status: 'Started',
      instanceId: scope.instanceId,
      moduleId: scope.moduleId,
      moduleInstanceId: scope.moduleInstanceId,
      lifecycle,
      session: this.cloneSession(session),
    }
  }

  /** 停止会话：更新状态为 Stopped，记录停止时间 */
  stopSession(options: AiRuntimeStopSessionOptions): AiRuntimeStopSessionResult {
    const sessionKey = moduleScopeKey(options.moduleId, options.moduleInstanceId)
    const previous = this.sessions.get(sessionKey)
    if (previous === undefined) {
      throw new Error(`Unknown AI session scope: ${options.moduleId}/${options.moduleInstanceId}`)
    }
    const stopInstanceId = options.instanceId ?? previous.instanceId
    const scope = {
      moduleId: options.moduleId,
      moduleInstanceId: options.moduleInstanceId,
      instanceId: stopInstanceId,
      runtimeInstanceId: options.instanceId === undefined ? previous.runtimeInstanceId : stopInstanceId,
    }
    this.assertSameSessionScope(previous, scope)
    this.assertInstanceAliasesAvailable(scope)
    const timestamp = this.now()
    const lifecycle = this.createLifecycleSnapshot(scope, 'Stopped', options.reason, timestamp)
    const session: AiRuntimeSessionRecord = {
      ...previous,
      ...scope,
      status: 'Stopped',
      updatedAt: timestamp,
      stoppedAt: timestamp,
      ...(options.reason === undefined ? {} : { reason: options.reason }),
    }
    this.storeSession(session)
    return {
      status: 'Stopped',
      instanceId: scope.instanceId,
      moduleId: scope.moduleId,
      moduleInstanceId: scope.moduleInstanceId,
      lifecycle,
      session: this.cloneSession(session),
    }
  }

  /** 归一化 scope：校验非空、设置默认值 */
  normalizeScope(options: AiRuntimeStartSessionOptions | AiRuntimeProjectKnowledgeOptions): AiRuntimeProjectKnowledgeOptions {
    const instanceId = options.instanceId ?? options.moduleInstanceId
    assertNonEmptyId('moduleId', options.moduleId)
    assertNonEmptyId('moduleInstanceId', options.moduleInstanceId)
    assertNonEmptyId('instanceId', instanceId)
    assertNonEmptyId('runtimeInstanceId', options.runtimeInstanceId ?? instanceId)
    return {
      moduleId: options.moduleId,
      moduleInstanceId: options.moduleInstanceId,
      instanceId,
      runtimeInstanceId: options.runtimeInstanceId ?? instanceId,
    }
  }

  /** 获取已启动的会话，未启动则抛出 */
  requireStartedSession(scope: AiRuntimeProjectKnowledgeOptions): AiRuntimeSessionRecord {
    const normalized = this.normalizeScope(scope)
    const failure = this.getSessionFailure(normalized)
    if (failure !== null) {
      throw new Error(`${failure.code}: ${failure.msg}`)
    }
    this.bindSessionAliases(normalized)
    const sessionKey = moduleScopeKey(normalized.moduleId, normalized.moduleInstanceId)
    const session = this.sessions.get(sessionKey)
    if (session === undefined) {
      throw new Error(`SESSION_NOT_STARTED: AI session for ${normalized.moduleId}/${normalized.moduleInstanceId} has not been started.`)
    }
    return session
  }

  /** 检查指定 scope 的会话是否失败（未启动或已停止） */
  getSessionFailure(scope: AiRuntimeProjectKnowledgeOptions): AiRuntimeFunctionCallFailure | null {
    const session = this.sessions.get(moduleScopeKey(scope.moduleId, scope.moduleInstanceId))
    if (session === undefined) {
      return createFunctionCallFailure(
        'SESSION_NOT_STARTED',
        `AI session for ${scope.moduleId}/${scope.moduleInstanceId} has not been started.`,
        'Call startSession with the same moduleId and moduleInstanceId before translating function calls.',
      )
    }
    if (session.status !== 'Started') {
      return createFunctionCallFailure(
        'SESSION_STOPPED',
        `AI session ${scope.instanceId} is ${session.status}.`,
        'Call startSession again or create a new AI session before translating function calls.',
      )
    }
    return null
  }

  // ── 别名管理 ──

  /** 绑定 instanceId / runtimeInstanceId → sessionKey 别名映射 */
  bindSessionAliases(scope: AiRuntimeProjectKnowledgeOptions): void {
    const sessionKey = moduleScopeKey(scope.moduleId, scope.moduleInstanceId)
    this.assertInstanceAliasesAvailable(scope)
    this.sessionScopesByInstanceId.set(scope.instanceId, sessionKey)
    if (scope.runtimeInstanceId !== scope.instanceId) {
      this.sessionScopesByInstanceId.set(scope.runtimeInstanceId, sessionKey)
    }
  }

  cloneProjection(projection: AiRuntimeKnowledgeProjection): AiRuntimeKnowledgeProjection {
    return cloneRuntimeValue(projection)
  }

  private createStartedSession(
    scope: AiRuntimeProjectKnowledgeOptions,
    projection: AiRuntimeKnowledgeProjection,
    previous: AiRuntimeSessionRecord | undefined,
    timestamp: number,
    reason: string | undefined,
  ): AiRuntimeSessionRecord {
    return {
      ...scope,
      status: 'Started',
      startedAt: previous?.startedAt ?? timestamp,
      updatedAt: timestamp,
      history: previous?.history.map((entry) => this.cloneHistoryEntry(entry)) ?? [],
      latestProjection: this.cloneProjection(projection),
      ...(reason === undefined ? {} : { reason }),
    }
  }

  private storeHistoryEntry(session: AiRuntimeSessionRecord, entry: AiRuntimeHistoryEntry, timestamp: number): void {
    const updated: AiRuntimeSessionRecord = {
      ...session,
      updatedAt: timestamp,
      history: [
        ...session.history.map((item) => this.cloneHistoryEntry(item)),
        this.cloneHistoryEntry(entry),
      ],
    }
    this.storeSession(updated)
  }

  private replaceHistoryEntry(
    session: AiRuntimeSessionRecord,
    index: number,
    entry: AiRuntimeHistoryEntry,
    timestamp: number,
  ): void {
    const history = session.history.map((item) => this.cloneHistoryEntry(item))
    history[index] = this.cloneHistoryEntry(entry)
    this.storeSession({
      ...session,
      updatedAt: timestamp,
      history,
    })
  }

  private historyEnvelope<TKind extends AiRuntimeHistoryEntryBase['kind']>(
    scope: AiRuntimeProjectKnowledgeOptions,
    timestamp: number,
    kind: TKind,
  ): Omit<AiRuntimeHistoryEntryBase, 'kind'> & { kind: TKind } {
    const seq = this.nextHistorySeq++
    return {
      id: `${scope.instanceId}:history:${seq}`,
      seq,
      timestamp,
      kind,
      moduleId: scope.moduleId,
      moduleInstanceId: scope.moduleInstanceId,
      instanceId: scope.instanceId,
      runtimeInstanceId: scope.runtimeInstanceId,
    }
  }

  private storeSession(session: AiRuntimeSessionRecord): void {
    const sessionKey = moduleScopeKey(session.moduleId, session.moduleInstanceId)
    this.assertInstanceAliasesAvailable(session)
    this.sessions.set(sessionKey, session)
    this.bindSessionAliases(session)
  }

  private assertSameSessionScope(session: AiRuntimeSessionRecord, scope: AiRuntimeProjectKnowledgeOptions): void {
    if (session.moduleId !== scope.moduleId || session.moduleInstanceId !== scope.moduleInstanceId) {
      throw new Error(
        `AI session ${scope.instanceId} is already bound to ${session.moduleId}/${session.moduleInstanceId}, cannot bind to ${scope.moduleId}/${scope.moduleInstanceId}.`,
      )
    }
  }

  private assertInstanceAliasesAvailable(scope: AiRuntimeProjectKnowledgeOptions): void {
    const sessionKey = moduleScopeKey(scope.moduleId, scope.moduleInstanceId)
    this.assertInstanceAliasAvailable(scope.instanceId, sessionKey)
    if (scope.runtimeInstanceId !== scope.instanceId) {
      this.assertInstanceAliasAvailable(scope.runtimeInstanceId, sessionKey)
    }
  }

  private assertInstanceAliasAvailable(alias: string, sessionKey: string): void {
    const existingKey = this.sessionScopesByInstanceId.get(alias)
    if (existingKey === undefined || existingKey === sessionKey) return
    const existing = this.sessions.get(existingKey)
    const existingScope = existing === undefined
      ? existingKey.replace('\u0000', '/')
      : `${existing.moduleId}/${existing.moduleInstanceId}`
    throw new Error(`AI session alias ${alias} is already bound to ${existingScope}`)
  }

  private createLifecycleSnapshot(
    scope: AiRuntimeProjectKnowledgeOptions,
    status: 'Started' | 'Stopped',
    reason: string | undefined,
    timestamp = this.now(),
  ) {
    return {
      ...scope,
      status,
      updatedAt: timestamp,
      ...(reason === undefined ? {} : { reason }),
    }
  }

  private cloneSession(session: AiRuntimeSessionRecord): AiRuntimeSessionRecord {
    return {
      ...session,
      ...(session.reason === undefined ? {} : { reason: session.reason }),
      ...(session.stoppedAt === undefined ? {} : { stoppedAt: session.stoppedAt }),
      ...(session.latestProjection === undefined ? {} : { latestProjection: this.cloneProjection(session.latestProjection) }),
      history: session.history.map((entry) => this.cloneHistoryEntry(entry)),
    }
  }

  private cloneHistoryEntry(entry: AiRuntimeMessageHistoryEntry): AiRuntimeMessageHistoryEntry
  private cloneHistoryEntry(entry: AiRuntimeFunctionCallHistoryEntry): AiRuntimeFunctionCallHistoryEntry
  private cloneHistoryEntry(entry: AiRuntimeHistoryEntry): AiRuntimeHistoryEntry
  private cloneHistoryEntry(entry: AiRuntimeHistoryEntry): AiRuntimeHistoryEntry {
    return cloneRuntimeValue(entry)
  }
}
