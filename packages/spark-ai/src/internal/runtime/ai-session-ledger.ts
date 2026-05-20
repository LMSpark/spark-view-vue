/**
 * AI 会话账本。
 *
 * 职责：内存中管理 AI 会话状态、历史记录和别名映射。
 * 不持久化，不发布事件，不执行函数。
 *
 * ID 格式说明：
 * - historyEntryId: "{instanceId}:history:{seq}"（如 "reg:instance:history:1"）
 * - sessionKey (内部): "{moduleId}\0{moduleInstanceId}"（用 null 字符分隔避免冲突）
 * - aliasKey: instanceId 或 runtimeInstanceId → sessionKey 的映射
 *
 * 会话生命周期时序：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 1. 启动会话                                                   │
 * │    prepareStartScope() → 归一化 scope + 校验别名不冲突         │
 * │    startSession()      → 创建 Started 状态会话 + 绑定别名     │
 * │                                                               │
 * │ 2. 会话操作                                                   │
 * │    appendMessage()     → 追加消息（user/assistant/system）     │
 * │    recordFunctionCallRequest()                                │
 * │                      → 追加函数调用（status=requested）       │
 * │    appendFunctionCall() → 直接追加函数调用（任意状态）         │
 * │    completeFunctionCall() → 更新已有函数调用的状态和结果       │
 * │                                                               │
 * │ 3. 查询会话                                                   │
 * │    getSession() / listSessions() / getSessionHistory()        │
 * │    requireStartedSession() → 获取运行中会话，否则抛异常        │
 * │    getSessionFailure()   → 检查会话是否未启动/已停止           │
 * │                                                               │
 * │ 4. 停止会话                                                   │
 * │    stopSession()       → 更新状态为 Stopped + 记录停止时间    │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 线程安全：所有操作都是同步的，不存在并发问题。
 * 深拷贝策略：所有返回给调用方的数据都会通过 cloneRuntimeValue() 深拷贝，
 *            防止外部修改内部状态。
 */

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

export class AiSessionLedger {
  /** moduleId\0moduleInstanceId → 会话记录 */
  private readonly sessions = new Map<string, AiRuntimeSessionRecord>()

  /** instanceId/runtimeInstanceId → sessionKey 的别名映射 */
  private readonly sessionScopesByInstanceId = new Map<string, string>()

  /** 历史记录序列号计数器，每次新增历史条目时递增 */
  private nextHistorySeq = 1

  /** 时间获取函数，可通过构造函数注入以便测试 */
  private readonly now: NonNullable<AiRuntimeOptions['now']>

  constructor(options: AiRuntimeOptions = {}) {
    this.now = options.now ?? Date.now
  }

  // ═══════════════════════════════════════════════════════
  // 会话查询（只读）
  // ═══════════════════════════════════════════════════════

  /**
   * 获取指定模块实例的会话记录。
   * 返回深拷贝，防止外部修改内部状态。
   * @returns 会话记录，未找到时返回 null
   */
  getSession(moduleId: string, moduleInstanceId: string): AiRuntimeSessionRecord | null {
    const session = this.sessions.get(moduleScopeKey(moduleId, moduleInstanceId))
    return session === undefined ? null : this.cloneSession(session)
  }

  /**
   * 列出所有会话记录。
   * @param moduleId 可选，按模块 ID 过滤
   */
  listSessions(moduleId?: string): readonly AiRuntimeSessionRecord[] {
    return Array.from(this.sessions.values())
      .filter((session) => moduleId === undefined || session.moduleId === moduleId)
      .map((session) => this.cloneSession(session))
  }

  /** 获取指定会话的历史记录列表（深拷贝） */
  getSessionHistory(moduleId: string, moduleInstanceId: string): readonly AiRuntimeHistoryEntry[] {
    const session = this.sessions.get(moduleScopeKey(moduleId, moduleInstanceId))
    return session?.history.map((entry) => this.cloneHistoryEntry(entry)) ?? []
  }

  // ═══════════════════════════════════════════════════════
  // 消息操作（写操作）
  // ═══════════════════════════════════════════════════════

  /**
   * 追加一条消息到会话历史。
   * 消息类型：user（用户输入）、assistant（AI 回复）、system（系统提示）。
   * 自动设置 source：user→ui, assistant→llm, system→system。
   */
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

  /**
   * 记录函数调用请求（status = 'requested'）。
   * 内部复用 appendFunctionCall()，仅预设 status 为 requested。
   * 这是 executeFunctionCall 流程中的步骤 2 记录。
   */
  recordFunctionCallRequest(options: AiRuntimeRecordFunctionCallRequestOptions): AiRuntimeFunctionCallHistoryEntry {
    return this.appendFunctionCall({
      ...options,
      status: 'requested',
    })
  }

  /**
   * 完成一个已存在的函数调用记录。
   * 通过 historyEntryId 查找已有条目，更新其状态和结果。
   *
   * 失败场景：
   * - historyEntryId 不存在 → 抛异常
   * - 条目类型不是 functionCall → 抛异常
   */
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

  /**
   * 追加一条函数调用记录到会话历史。
   *
   * 支持的状态：
   * - 'requested': 仅记录请求，等待后续 completeFunctionCall() 更新
   * - 'completed': 直接记录完成
   * - 'failed': 直接记录失败（含 error 字段）
   *
   * 注意：status 默认为 'completed'；非 requested 状态会自动设置 completedAt。
   */
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

  // ═══════════════════════════════════════════════════════
  // 会话生命周期（启动 / 停止）
  // ═══════════════════════════════════════════════════════

  /**
   * 准备启动会话的 scope。
   *
   * 归一化规则：
   * - instanceId: 优先使用传入值 → 回退到已有会话的 instanceId → 最终回退到 moduleInstanceId
   * - runtimeInstanceId: 优先使用传入值 → 当传入了 instanceId 时用 instanceId → 回退到已有会话的值 → 最终用 instanceId
   *
   * 在归一化后会校验别名不冲突，防止同一别名被绑定到不同会话。
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

  /**
   * 创建 Started 状态的会话并存储。
   *
   * 行为：
   * - 如果同一 moduleScope 已有会话，会继承其 startedAt 和历史记录
   * - 新会话绑定别名（instanceId → sessionKey, runtimeInstanceId → sessionKey）
   * - 返回包含知识投影和生命周期快照的完整结果
   */
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

  /**
   * 停止会话。
   *
   * 校验：
   * - 会话必须存在（否则抛异常）
   * - moduleId/moduleInstanceId 必须与已有会话一致（防止 session 被 hijack）
   * - 别名不能冲突
   *
   * 结果：状态更新为 Stopped，记录 stoppedAt 和可选的 reason。
   */
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

  // ═══════════════════════════════════════════════════════
  // 内部辅助：归一化 / 校验 / 别名
  // ═══════════════════════════════════════════════════════

  /**
   * 归一化 session scope。
   *
   * 校验所有 ID 非空，设置默认值：
   * - instanceId 默认等于 moduleInstanceId
   * - runtimeInstanceId 默认等于 instanceId
   */
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

  /**
   * 获取已启动的会话，失败则抛出异常。
   *
   * 校验链：
   * 1. 归一化 scope
   * 2. 检查会话是否失败（未启动/已停止）→ 失败则抛
   * 3. 绑定别名（instanceId → sessionKey）
   * 4. 查找并返回会话记录
   */
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

  /**
   * 检查指定 scope 的会话是否处于失败状态。
   *
   * 返回 Failure 对象或 null：
   * - SESSION_NOT_STARTED: 会话从未启动
   * - SESSION_STOPPED: 会话已停止（非 Started 状态）
   * - null: 会话正常运行
   */
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

  // ═══════════════════════════════════════════════════════
  // 别名管理
  // ═══════════════════════════════════════════════════════

  /**
   * 绑定 instanceId / runtimeInstanceId → sessionKey 的别名映射。
   *
   * 映射关系：
   * - instanceId → "{moduleId}\0{moduleInstanceId}"
   * - runtimeInstanceId（如不同）→ 同上
   *
   * 用途：通过 instanceId 或 runtimeInstanceId 反向查找对应的会话。
   */
  bindSessionAliases(scope: AiRuntimeProjectKnowledgeOptions): void {
    const sessionKey = moduleScopeKey(scope.moduleId, scope.moduleInstanceId)
    this.assertInstanceAliasesAvailable(scope)
    this.sessionScopesByInstanceId.set(scope.instanceId, sessionKey)
    if (scope.runtimeInstanceId !== scope.instanceId) {
      this.sessionScopesByInstanceId.set(scope.runtimeInstanceId, sessionKey)
    }
  }

  /** 深拷贝知识投影（供外部返回使用） */
  cloneProjection(projection: AiRuntimeKnowledgeProjection): AiRuntimeKnowledgeProjection {
    return cloneRuntimeValue(projection)
  }

  // ═══════════════════════════════════════════════════════
  // 私有辅助：会话存储与历史管理
  // ═══════════════════════════════════════════════════════

  /**
   * 创建一个 Started 状态的会话记录。
   * 如果存在 previous 会话，则继承 startedAt 和历史记录。
   */
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

  /**
   * 存储会话记录到内存 Map。
   * 每次存储都会同步更新别名映射。
   */
  private storeSession(session: AiRuntimeSessionRecord): void {
    const sessionKey = moduleScopeKey(session.moduleId, session.moduleInstanceId)
    this.assertInstanceAliasesAvailable(session)
    this.sessions.set(sessionKey, session)
    this.bindSessionAliases(session)
  }

  /**
   * 新增历史条目到会话。
   * 先深拷贝已有历史，再追加新条目，最后存储更新后的会话。
   */
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

  /**
   * 替换指定索引位置的历史条目。
   * 用于 completeFunctionCall 更新已有函数调用记录。
   */
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

  /**
   * 创建历史条目的基础信封。
   * 包含：唯一 ID（"{instanceId}:history:{seq}"）、序列号、时间戳、作用域信息。
   */
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

  /** 校验新 scope 与已有会话的 moduleId/moduleInstanceId 一致 */
  private assertSameSessionScope(session: AiRuntimeSessionRecord, scope: AiRuntimeProjectKnowledgeOptions): void {
    if (session.moduleId !== scope.moduleId || session.moduleInstanceId !== scope.moduleInstanceId) {
      throw new Error(
        `AI session ${scope.instanceId} is already bound to ${session.moduleId}/${session.moduleInstanceId}, cannot bind to ${scope.moduleId}/${scope.moduleInstanceId}.`,
      )
    }
  }

  /** 校验指定 scope 的所有别名（instanceId / runtimeInstanceId）未被其他会话占用 */
  private assertInstanceAliasesAvailable(scope: AiRuntimeProjectKnowledgeOptions): void {
    const sessionKey = moduleScopeKey(scope.moduleId, scope.moduleInstanceId)
    this.assertInstanceAliasAvailable(scope.instanceId, sessionKey)
    if (scope.runtimeInstanceId !== scope.instanceId) {
      this.assertInstanceAliasAvailable(scope.runtimeInstanceId, sessionKey)
    }
  }

  /** 校验单个别名是否已被其他 sessionKey 占用 */
  private assertInstanceAliasAvailable(alias: string, sessionKey: string): void {
    const existingKey = this.sessionScopesByInstanceId.get(alias)
    if (existingKey === undefined || existingKey === sessionKey) return
    const existing = this.sessions.get(existingKey)
    const existingScope = existing === undefined
      ? existingKey.replace(' ', '/')
      : `${existing.moduleId}/${existing.moduleInstanceId}`
    throw new Error(`AI session alias ${alias} is already bound to ${existingScope}`)
  }

  /** 创建生命周期快照（用于 startSession/stopSession 的返回结果） */
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

  /** 深拷贝会话记录（含历史记录和投影） */
  private cloneSession(session: AiRuntimeSessionRecord): AiRuntimeSessionRecord {
    return {
      ...session,
      ...(session.reason === undefined ? {} : { reason: session.reason }),
      ...(session.stoppedAt === undefined ? {} : { stoppedAt: session.stoppedAt }),
      ...(session.latestProjection === undefined ? {} : { latestProjection: this.cloneProjection(session.latestProjection) }),
      history: session.history.map((entry) => this.cloneHistoryEntry(entry)),
    }
  }

  /** 深拷贝历史条目（重载签名保证返回类型精确） */
  private cloneHistoryEntry(entry: AiRuntimeMessageHistoryEntry): AiRuntimeMessageHistoryEntry
  private cloneHistoryEntry(entry: AiRuntimeFunctionCallHistoryEntry): AiRuntimeFunctionCallHistoryEntry
  private cloneHistoryEntry(entry: AiRuntimeHistoryEntry): AiRuntimeHistoryEntry
  private cloneHistoryEntry(entry: AiRuntimeHistoryEntry): AiRuntimeHistoryEntry {
    return cloneRuntimeValue(entry)
  }
}
