import type {
  AiRuntimeAppendFunctionCallOptions,
  AiRuntimeAppendMessageOptions,
  AiRuntimeCompleteFunctionCallOptions,
  AiModuleInstanceBinding,
  AiModuleRegistration,
  AiRegisteredModuleApi,
  AiModuleRegistrationData,
  AiModuleRegistrationStoreSnapshot,
  AiRuntimeAction,
  AiRuntimeApi,
  AiRuntimeCreateFunctionResultMessageOptions,
  AiRuntimeExecuteFunctionCallOptions,
  AiRuntimeEvent,
  AiRuntimeEventListener,
  AiRuntimeEventUnsubscribe,
  AiRuntimeFunctionCallFailure,
  AiRuntimeFunctionCallHistoryEntry,
  AiRuntimeFunctionCallResult,
  AiRuntimeFunctionCallRunInput,
  AiRuntimeFunctionCallTranslation,
  AiRuntimeFunctionCallTranslationResult,
  AiRuntimeFunctionExposure,
  AiRuntimeFunctionResultMessage,
  AiRuntimeHistoryEntry,
  AiRuntimeHistoryEntryBase,
  AiRuntimeInstanceLifecycleSnapshot,
  AiRuntimeInstanceScope,
  AiRuntimeKnowledgeProjection,
  AiRuntimeMessageHistoryEntry,
  AiRuntimeModuleExposure,
  AiRuntimeOptions,
  AiRuntimeProjectModuleOptions,
  AiRuntimeRecordFunctionCallRequestOptions,
  AiRuntimeSessionRecord,
  AiRuntimeSessionSnapshot,
  AiRuntimeStartInstanceOptions,
  AiRuntimeStartInstanceResult,
  AiRuntimeStopInstanceOptions,
  AiRuntimeStopInstanceResult,
  AiRuntimeTranslateFunctionCallOptions,
  FunctionExecutionContext,
} from '../../protocol/runtime-contracts'
import { AiInvocationProtocol } from '../../protocol/invocation-helpers'
import {
  AiRuntimeArgValidator,
  AiRuntimeProjector,
} from './ai-runtime-support'
import { ParameterPayloadRegistry } from '../knowledge/parameter-payload-registry'
import { AiKnowledgeProjector } from '../knowledge/knowledge-projection'
import type { AiKnowledgeProjection } from '../knowledge/knowledge-projection'

/** 克隆 runtime 对外返回值，避免调用方修改 core 保存的 session/history 快照。 */
function cloneRuntimeValue<T>(value: T): T {
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

/**
 * SPARK AI core facade。
 *
 * 语义中心是 AI session：
 * - A：模块实例保存自己的运行状态和执行器。
 * - C：模块注册把模块知识与函数知识交给 core。
 * - B：core 会话管理保存 session/history，并把知识投影给 LLM。
 * - LLM：在会话上下文中编排函数调用。
 * - B：core 记录 requested 调用、翻译调用、调用外部落点、回填 completed/failed 结果。
 * - A：模块实例只保存真实服务能力和落点绑定。
 *
 * start/stop 与 AI 会话生命周期一致：核心会保存 AI session 状态和
 * UI/LLM/函数调用历史；但它不创建模块服务实例、不释放模块、不保存
 * 模块运行状态，也不拥有函数实现，更不会根据执行结果决定下一步调用。
 */
export class AiRuntime implements AiRuntimeApi {
  /** 顶层模块知识注册表。这里只保存注册方声明的静态/动态知识入口，不保存模块运行状态。 */
  private readonly modules = new Map<string, AiModuleRegistration>()

  /** AI 会话表。主键是 `moduleId + moduleInstanceId`，即模块注册 ID + 根模块实例 ID。 */
  private readonly sessions = new Map<string, AiRuntimeSessionRecord>()

  /** 技术 instanceId 到模块隔离键的兼容索引；instanceId 不决定 session 隔离。 */
  private readonly sessionScopesByInstanceId = new Map<string, string>()

  /** APP/宿主订阅的框架无关事件监听器。 */
  private readonly eventListeners = new Set<AiRuntimeEventListener>()

  /** 全局单调递增历史序号。序号只用于 core ledger，不参与模块侧排序。 */
  private nextHistorySeq = 1

  /** 无状态模块投影器：负责把注册树变成 LLM 可见的模块/函数暴露。 */
  private readonly projector = new AiRuntimeProjector(AiRuntime.actionOf, AiRuntime.assertId)

  /** 轻量参数校验器：只在翻译阶段阻断明显结构错误。 */
  private readonly argValidator = new AiRuntimeArgValidator()

  /** 时间源仅用于 start/stop 返回快照，不用于生命周期决策。 */
  private readonly now: NonNullable<AiRuntimeOptions['now']>

  /** 核心层知识投影器：统一暴露函数目录、模块目录、参数 payload 查询能力。 */
  private readonly knowledgeProjector: AiKnowledgeProjector

  /** 创建一个 core facade；options 不会引入任何模块服务实例管理。 */
  constructor(options: AiRuntimeOptions = {}) {
    this.now = options.now ?? Date.now
    this.knowledgeProjector = new AiKnowledgeProjector(ParameterPayloadRegistry.defaultRegistry)
    const listeners = options.onEvent === undefined
      ? []
      : typeof options.onEvent === 'function'
        ? [options.onEvent]
        : options.onEvent
    listeners.forEach((listener) => this.eventListeners.add(listener))
  }

  /** 注册顶层模块知识树；重复 moduleId 会 fail-fast，并返回绑定 moduleId 的 API 包装器。 */
  registerModule(source: AiModuleRegistration | AiModuleRegistrationData | AiModuleRegistrationStoreSnapshot): AiRegisteredModuleApi {
    const registration = this.projector.createRuntimeRegistration(source)
    this.projector.assertUniqueRegistrationKeys(registration)
    if (this.modules.has(registration.moduleId)) {
      throw new Error(`Duplicate AI module registration: ${registration.moduleId}`)
    }
    this.modules.set(registration.moduleId, registration)
    this.emitEvent({
      type: 'module.registered',
      timestamp: this.now(),
      moduleId: registration.moduleId,
    })
    return this.createRegisteredModuleApi(registration)
  }

  /** 订阅 core 事件；APP 通过事件观察 AI 包内部账本变化。 */
  subscribe(listener: AiRuntimeEventListener): AiRuntimeEventUnsubscribe {
    this.eventListeners.add(listener)
    return () => {
      this.eventListeners.delete(listener)
    }
  }

  /** 按 moduleId 读取模块知识注册；未知模块返回 undefined。 */
  getModuleRegistration(moduleId: string): AiModuleRegistration | undefined {
    return this.modules.get(moduleId)
  }

  /** 列出已注册模块知识树；列表不代表服务实例或会话状态。 */
  listModuleRegistrations(): readonly AiModuleRegistration[] {
    return Array.from(this.modules.values())
  }

  /** 按 moduleId 读取可持久化模块注册数据；未知模块返回 undefined。 */
  getModuleRegistrationData(moduleId: string): AiModuleRegistrationData | undefined {
    const registration = this.modules.get(moduleId)
    return registration === undefined ? undefined : this.projector.createRegistrationData(registration)
  }

  /** 列出已注册模块的可持久化数据快照。 */
  listModuleRegistrationData(): readonly AiModuleRegistrationData[] {
    return Array.from(this.modules.values()).map((registration) => this.projector.createRegistrationData(registration))
  }

  /** 按 moduleId 读取结构化持久化快照；未知模块返回 undefined。 */
  getModuleRegistrationStoreSnapshot(moduleId: string): AiModuleRegistrationStoreSnapshot | undefined {
    const registration = this.modules.get(moduleId)
    return registration === undefined ? undefined : this.projector.createRegistrationStoreSnapshot(registration)
  }

  /** 列出已注册模块的结构化持久化快照。 */
  listModuleRegistrationStoreSnapshots(): readonly AiModuleRegistrationStoreSnapshot[] {
    return Array.from(this.modules.values()).map((registration) => this.projector.createRegistrationStoreSnapshot(registration))
  }

  /** 按技术 instanceId 读取会话记录；真实隔离仍以 moduleId + moduleInstanceId 为准。 */
  getSession(instanceId: string): AiRuntimeSessionRecord | null {
    const session = this.getSessionByInstanceId(instanceId)
    return session === undefined ? null : this.cloneSession(session)
  }

  /** 按模块注册 ID + 根模块实例 ID 读取 AI 会话记录。 */
  getSessionByModuleScope(scope: { moduleId: string; moduleInstanceId: string }): AiRuntimeSessionRecord | null {
    const session = this.sessions.get(AiRuntime.moduleScopeKey(scope.moduleId, scope.moduleInstanceId))
    return session === undefined ? null : this.cloneSession(session)
  }

  /** 按技术 instanceId 读取 AI 会话历史；未知 session 返回空数组，便于 UI 恢复时做空态展示。 */
  getSessionHistory(instanceId: string): readonly AiRuntimeHistoryEntry[] {
    return this.getSessionByInstanceId(instanceId)?.history.map((entry) => this.cloneHistoryEntry(entry)) ?? []
  }

  /** 按模块隔离键读取 AI 会话历史；这是模块注册方更稳定的读取入口。 */
  getSessionHistoryByModuleScope(scope: { moduleId: string; moduleInstanceId: string }): readonly AiRuntimeHistoryEntry[] {
    const session = this.sessions.get(AiRuntime.moduleScopeKey(scope.moduleId, scope.moduleInstanceId))
    return session?.history.map((entry) => this.cloneHistoryEntry(entry)) ?? []
  }

  /** 导出单条 core session 快照，供宿主持久化或诊断。 */
  exportSessionSnapshot(scope: { moduleId: string; moduleInstanceId: string }): AiRuntimeSessionSnapshot | null {
    const session = this.sessions.get(AiRuntime.moduleScopeKey(scope.moduleId, scope.moduleInstanceId))
    if (session === undefined) return null
    return {
      version: 1,
      session: this.cloneSession(session),
      nextHistorySeq: Math.max(this.nextHistorySeq, AiRuntime.nextHistorySeqAfter(session)),
    }
  }

  /** 恢复一条 core session 快照；恢复前要求对应模块知识已注册。 */
  hydrateSessionSnapshot(snapshot: AiRuntimeSessionSnapshot): AiRuntimeSessionRecord {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (snapshot.version !== 1) {
      throw new Error(`Unsupported AI session snapshot version: ${String(snapshot.version)}`)
    }
    const session = this.cloneSession(snapshot.session)
    this.getModuleOrThrow(session.moduleId)
    const scope = this.normalizeScope(session)
    const restored: AiRuntimeSessionRecord = {
      ...session,
      ...scope,
      history: session.history.map((entry) => this.cloneHistoryEntry(entry)),
      ...(session.latestProjection === undefined ? {} : { latestProjection: this.cloneProjection(session.latestProjection) }),
    }
    this.nextHistorySeq = Math.max(
      this.nextHistorySeq,
      snapshot.nextHistorySeq,
      AiRuntime.nextHistorySeqAfter(restored),
    )
    this.storeSession(restored)
    this.emitEvent({
      type: 'session.hydrated',
      timestamp: this.now(),
      moduleId: restored.moduleId,
      scope: AiRuntime.scopeOf(restored),
      session: this.cloneSession(restored),
    })
    return this.cloneSession(restored)
  }

  /** 获取核心知识投影器。用于统一的知识查询（函数目录、模块目录、参数指南）。 */
  getKnowledgeProjection(): AiKnowledgeProjection {
    return this.knowledgeProjector
  }

  /** 追加 UI/LLM/system 消息历史。 */
  appendMessage(options: AiRuntimeAppendMessageOptions): AiRuntimeMessageHistoryEntry {
    const session = this.requireStartedSession(options)
    const timestamp = this.now()
    const entry: AiRuntimeMessageHistoryEntry = {
      ...this.historyEnvelope(session, timestamp, 'message'),
      role: options.role,
      source: options.source ?? AiRuntime.defaultMessageSource(options.role),
      content: options.content,
      ...(options.metadata === undefined ? {} : { metadata: cloneRuntimeValue(options.metadata) }),
    }
    const updatedSession = this.storeHistoryEntry(session, entry, timestamp)
    this.emitEvent({
      type: 'history.message.appended',
      timestamp,
      moduleId: entry.moduleId,
      scope: AiRuntime.scopeOf(entry),
      entry: this.cloneHistoryEntry(entry) as AiRuntimeMessageHistoryEntry,
      session: this.cloneSession(updatedSession),
    })
    return this.cloneHistoryEntry(entry) as AiRuntimeMessageHistoryEntry
  }

  /** 记录 LLM 刚刚编排出的函数调用请求；这是 LLM -> core -> module 这条链路的入口账本。 */
  recordFunctionCallRequest(options: AiRuntimeRecordFunctionCallRequestOptions): AiRuntimeFunctionCallHistoryEntry {
    return this.appendFunctionCall({
      ...options,
      status: 'requested',
    })
  }

  /** 将一次 requested 函数调用更新为完成或失败；只更新历史，不解释结果。 */
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
    if (previous.status !== 'requested') {
      throw new Error(`AI function call history entry ${options.historyEntryId} is already ${previous.status}`)
    }

    const timestamp = this.now()
    const status = options.status ?? (options.error === undefined ? 'completed' : 'failed')
    const metadata = AiRuntime.mergeMetadata(previous.metadata, options.metadata)
    const updated: AiRuntimeFunctionCallHistoryEntry = {
      ...previous,
      status,
      completedAt: timestamp,
      ...(options.result === undefined ? {} : { result: cloneRuntimeValue(options.result) }),
      ...(options.resultMessage === undefined ? {} : { resultMessage: cloneRuntimeValue(options.resultMessage) }),
      ...(options.error === undefined ? {} : { error: { ...options.error } }),
      ...(metadata === undefined ? {} : { metadata }),
    }
    const updatedSession = this.replaceHistoryEntry(session, index, updated, timestamp)
    this.emitEvent({
      type: status === 'failed' ? 'history.function.failed' : 'history.function.completed',
      timestamp,
      moduleId: updated.moduleId,
      scope: AiRuntime.scopeOf(updated),
      entry: this.cloneHistoryEntry(updated) as AiRuntimeFunctionCallHistoryEntry,
      session: this.cloneSession(updatedSession),
    })
    return this.cloneHistoryEntry(updated) as AiRuntimeFunctionCallHistoryEntry
  }

  /** 追加 LLM 编排的函数调用历史；只记录，不执行、不调度、不解释结果。 */
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
    const updatedSession = this.storeHistoryEntry(session, entry, timestamp)
    this.emitEvent({
      type: entry.status === 'requested'
        ? 'history.function.requested'
        : entry.status === 'failed'
          ? 'history.function.failed'
          : 'history.function.completed',
      timestamp,
      moduleId: entry.moduleId,
      scope: AiRuntime.scopeOf(entry),
      entry: this.cloneHistoryEntry(entry) as AiRuntimeFunctionCallHistoryEntry,
      session: this.cloneSession(updatedSession),
    })
    return this.cloneHistoryEntry(entry) as AiRuntimeFunctionCallHistoryEntry
  }

  /**
   * 接收 AI 会话开始通知。
   *
   * 语义：
   * - core 校验模块已注册。
   * - core 立刻按调用方给定 scope 投影 LLM 知识。
   * - core 返回 Started 快照。
   * - core 保存 AI session record 和最近投影。
   * - core 不创建模块服务实例。
   */
  async startInstance(options: AiRuntimeStartInstanceOptions): Promise<AiRuntimeStartInstanceResult> {
    this.getModuleOrThrow(options.moduleId)
    const sessionKey = AiRuntime.moduleScopeKey(options.moduleId, options.moduleInstanceId)
    const previous = this.sessions.get(sessionKey)
    const scope = this.normalizeStartScope(options, previous)
    this.assertInstanceAliasesAvailable(scope)
    const projection = await this.projectModule(scope)
    const timestamp = this.now()
    const latestPrevious = this.sessions.get(sessionKey)
    if (latestPrevious !== undefined) this.assertSameSessionScope(latestPrevious, scope)
    const lifecycle = this.createLifecycleSnapshot(scope, 'Started', options.reason, timestamp)
    const session = this.createStartedSession(scope, projection, latestPrevious ?? previous, timestamp, options.reason)
    this.storeSession(session)
    this.emitEvent({
      type: 'session.started',
      timestamp,
      moduleId: session.moduleId,
      scope: AiRuntime.scopeOf(session),
      session: this.cloneSession(session),
    })
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
   * 接收 AI 会话结束通知。
   *
   * 语义：
   * - core 校验模块已注册。
   * - core 返回 Stopped 快照。
   * - core 更新 AI session record。
   * - core 不释放模块状态；Stopped 后新的函数翻译需要重新 start。
   */
  stopInstance(options: AiRuntimeStopInstanceOptions): AiRuntimeStopInstanceResult {
    this.getModuleOrThrow(options.moduleId)
    const sessionKey = AiRuntime.moduleScopeKey(options.moduleId, options.moduleInstanceId)
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
    this.emitEvent({
      type: 'session.stopped',
      timestamp,
      moduleId: session.moduleId,
      scope: AiRuntime.scopeOf(session),
      session: this.cloneSession(session),
    })
    return {
      status: 'Stopped',
      instanceId: scope.instanceId,
      moduleId: scope.moduleId,
      moduleInstanceId: scope.moduleInstanceId,
      lifecycle,
      session: this.cloneSession(session),
    }
  }

  /**
   * 按调用方给定的会话 scope 投影当前模块知识。
   *
   * prompt provider 可能依赖 scope 动态生成 prompt，因此本方法是异步的。
   * 返回值是快照；调用方可以把它固定在同一轮 LLM 交互中使用。
   *
   * 副作用：更新核心知识投影器，使其后续 queryFunctions/guideModule 查询可用。
   */
  async projectModule(options: AiRuntimeProjectModuleOptions): Promise<AiRuntimeKnowledgeProjection> {
    const scope = this.normalizeScope(options)
    const module = this.getModuleOrThrow(scope.moduleId)
    const exposure = await this.projector.projectModule(module, scope)
    const availableFunctions = this.projector.flattenFunctions(exposure)
    const projection = {
      scope,
      module: this.projector.cloneModuleExposure(exposure),
      promptSnapshot: this.projector.buildPromptSnapshot(exposure),
      availableFunctions: this.projector.cloneExposure(availableFunctions),
    }
    // 更新核心知识投影器，使其可以响应后续的 queryFunctions/guideModule 查询
    this.knowledgeProjector.updateProjection({
      scope,
      availableFunctions: projection.availableFunctions,
      module: projection.module,
    })
    return projection
  }

  /**
   * 翻译一次 LLM 函数调用。
   *
   * 本方法只做：
   * - 解析 action。
   * - 定位模块注册和函数注册。
   * - 补齐并校验上下文参数。
   * - 生成 FunctionExecutionContext。
   *
   * 本方法不做：
   * - 不执行 functionRegistration。
   * - 不更新 active path。
   * - 不读取函数执行结果，不基于结果做编排或结果验证。
   *
   * 会话约束：
   * - translate 必须发生在 Started 的 AI session 中。
   * - 函数调用历史由 `appendFunctionCall` 记录；translate 本身不执行函数，也不写结果。
   */
  async translateFunctionCall(
    options: AiRuntimeTranslateFunctionCallOptions,
  ): Promise<AiRuntimeFunctionCallTranslationResult> {
    const scope = this.normalizeScope(options)
    const sessionFailure = this.getSessionFailure(scope)
    if (sessionFailure !== null) return sessionFailure
    try {
      this.bindSessionAliases(scope)
    } catch (error) {
      return AiRuntime.createFailure(
        'SESSION_ALIAS_CONFLICT',
        AiInvocationProtocol.toErrorMessage(error),
        'Use a distinct AI session instanceId, or keep the same moduleId/moduleInstanceId scope for this alias.',
      )
    }
    const sessionKey = AiRuntime.moduleScopeKey(scope.moduleId, scope.moduleInstanceId)
    const session = this.sessions.get(sessionKey) as AiRuntimeSessionRecord

    let address: ReturnType<typeof AiInvocationProtocol.parseActionPath>
    try {
      address = AiInvocationProtocol.parseActionPath(options.action)
    } catch (error) {
      return AiRuntime.createFailure('INVALID_ACTION', AiInvocationProtocol.toErrorMessage(error), 'Use action format rootInstance[/childInstance]@module@actionName.')
    }

    if (address.format === 'legacy' && address.moduleIds[0] !== scope.moduleId) {
      return AiRuntime.createFailure(
        'MODULE_MISMATCH',
        `Action ${options.action} targets module ${address.moduleIds[0] ?? ''}, but current scope is ${scope.moduleId}.`,
        'Use an action from the projected functions for the same module scope.',
      )
    }

    if (address.format === 'instance' && address.instanceIds[0] !== session.moduleInstanceId) {
      return AiRuntime.createFailure(
        'CONTEXT_MISMATCH',
        `Action ${options.action} targets root instance ${address.instanceIds[0] ?? ''}, but current root entity is ${session.moduleInstanceId}.`,
        'Use the root module instance id from the current session as the action prefix.',
      )
    }

    const rootModule = this.getModuleOrThrow(scope.moduleId)
    let targetModule: AiModuleRegistration | null
    try {
      targetModule = address.format === 'instance'
        ? this.findModuleRegistrationByModuleId(rootModule, address.moduleId)
        : this.findModuleRegistration(rootModule, address.moduleIds)
    } catch (error) {
      return AiRuntime.createFailure(
        'MODULE_AMBIGUOUS',
        AiInvocationProtocol.toErrorMessage(error),
        'Use unique module IDs in the registration tree, or extend the action module segment to a unique module path.',
      )
    }
    if (targetModule === null) {
      return AiRuntime.createFailure(
        'MODULE_NOT_AVAILABLE',
        `Module path ${address.modulePath} is not registered under module ${scope.moduleId}.`,
        'Use a module path exposed by the current module registration.',
      )
    }

    const projection = options.projection ?? await this.projectModule(scope)
    if (projection.scope.moduleId !== scope.moduleId || projection.scope.moduleInstanceId !== scope.moduleInstanceId) {
      return AiRuntime.createFailure(
        'PROJECTION_SCOPE_MISMATCH',
        `Projection scope ${projection.scope.moduleId}/${projection.scope.moduleInstanceId} does not match ${scope.moduleId}/${scope.moduleInstanceId}.`,
        'Project functions again for the same module scope before translating this call.',
      )
    }

    let exposure: AiRuntimeFunctionExposure | undefined
    try {
      exposure = this.findFunctionExposure(projection.availableFunctions, address, options.action)
    } catch (error) {
      return AiRuntime.createFailure(
        'FUNCTION_AMBIGUOUS',
        AiInvocationProtocol.toErrorMessage(error),
        'Use unique module/function pairs in the LLM projection.',
      )
    }
    if (exposure === undefined) {
      return AiRuntime.createFailure(
        'FUNCTION_NOT_AVAILABLE',
        `Function ${options.action} is not available in the current LLM knowledge projection.`,
        'Use one of projection.availableFunctions for this module scope.',
      )
    }

    const actionPathError = this.validateActionInstancePath(address, exposure, session)
    if (actionPathError !== null) return actionPathError

    const definition = targetModule.getFunctions().find((candidate) => candidate.functionId === address.function)
    if (definition === undefined) {
      return AiRuntime.createFailure(
        'FUNCTION_DEFINITION_MISSING',
        `Function definition ${options.action} is missing from module ${address.modulePath}.`,
        'Fix the module registration so registered functions and exposed actions stay aligned.',
      )
    }

    const mergedActivePath = this.mergeActionInstancePath(address, exposure, options.activePath ?? [], session)
    if ('ok' in mergedActivePath) return mergedActivePath
    const activePath = this.normalizeActivePath(projection.module, mergedActivePath)
    const contextArgs = this.prepareExecutionArgs(scope, exposure, options.args, activePath)
    if ('ok' in contextArgs) return contextArgs

    const validationError = this.argValidator.validateArgsBySchema(exposure.paramsSchema, contextArgs.effectiveArgs)
    if (validationError !== null) {
      return AiRuntime.createFailure('INVALID_ARGS', validationError, `Use paramsSchema from projection.availableFunctions for ${options.action}.`)
    }

    const context: FunctionExecutionContext = {
      instanceId: session.instanceId,
      runtimeInstanceId: session.runtimeInstanceId,
      moduleId: session.moduleId,
      moduleInstanceId: session.moduleInstanceId,
      modulePath: exposure.modulePath,
      moduleIds: exposure.moduleIds,
      functionId: address.function,
      action: options.action,
      moduleInstances: contextArgs.moduleInstances,
      activePath: this.projector.createActivePathSnapshot(session, activePath),
    }

    const translation: AiRuntimeFunctionCallTranslation = {
      action: options.action,
      rawArgs: options.args,
      effectiveArgs: contextArgs.effectiveArgs,
      executionArgs: contextArgs.executionArgs,
      context,
      exposure,
      moduleRegistration: targetModule,
      functionRegistration: definition,
    }
    return { ok: true, translation }
  }

  /**
   * 把注册方执行函数后的原始结果转换成 LLM tool result 内容。
   *
   * 本方法只做序列化：
   * - 不检查 `ok`、`code`、`data` 等注册方结果字段。
   * - 不根据结果决定是否重试、继续调用或停止。
   * - 不校验 resultSchema；resultSchema 只属于 LLM-facing 知识说明。
   */
  createFunctionResultMessage(options: AiRuntimeCreateFunctionResultMessageOptions): AiRuntimeFunctionResultMessage {
    return {
      action: options.action,
      result: options.result,
      content: AiRuntime.stringifyFunctionResult(options.result),
    }
  }

  /**
   * 完整处理一次函数调用翻译、账本记录、模块落点运行和结果回填。
   *
   * core 负责执行翻译链路：
   * - translate action/args/context。
   * - 记录 requested。
   * - 调用调用方提供的模块落点。
   * - 归一化结果并 complete 为 completed/failed。
   *
   * core 仍然不拥有模块服务状态，也不根据结果做下一步编排。
   */
  async executeFunctionCall(options: AiRuntimeExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallResult<unknown>> {
    const translated = await this.translateFunctionCall(options)
    if (!translated.ok) {
      this.tryRecordFailedFunctionCall(options, translated)
      return translated
    }

    const translation = translated.translation
    const runInput: AiRuntimeFunctionCallRunInput = {
      translation,
      moduleRegistration: translation.moduleRegistration,
      functionRegistration: translation.functionRegistration,
      args: translation.executionArgs,
      context: translation.context,
    }
    const requestEntry = this.recordFunctionCallRequest({
      instanceId: translation.context.instanceId,
      moduleId: translation.context.moduleId,
      moduleInstanceId: translation.context.moduleInstanceId,
      runtimeInstanceId: translation.context.runtimeInstanceId,
      action: translation.action,
      args: translation.rawArgs,
      modulePath: translation.context.modulePath,
      functionId: translation.context.functionId,
      activePath: translation.context.activePath,
      ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
    })

    const validationError = options.validate?.(runInput) ?? null
    if (validationError !== null) {
      const failed = AiRuntime.createFailure('INVALID_ARGS', validationError, `Fix args for ${translation.action} before retrying.`)
      this.completeTranslatedFunctionCall(translation, failed, requestEntry.id, options.metadata)
      return failed
    }

    try {
      const rawResult = await options.run(runInput)
      const result = options.normalizeResult?.(rawResult, runInput)
        ?? AiRuntime.normalizeFunctionCallResult(rawResult, translation.action)
      this.completeTranslatedFunctionCall(translation, result, requestEntry.id, options.metadata)
      return result
    } catch (error) {
      const failed = AiRuntime.createFailure(
        'EXECUTE_ERROR',
        AiInvocationProtocol.toErrorMessage(error),
        options.errorFix ?? `Fix ${translation.action} implementation or retry with valid args after checking runtime state.`,
      )
      this.completeTranslatedFunctionCall(translation, failed, requestEntry.id, options.metadata)
      return failed
    }
  }

  private tryRecordFailedFunctionCall(options: AiRuntimeExecuteFunctionCallOptions, error: AiRuntimeFunctionCallFailure): void {
    try {
      this.appendFunctionCall({
        instanceId: options.instanceId,
        moduleId: options.moduleId,
        moduleInstanceId: options.moduleInstanceId,
        runtimeInstanceId: options.runtimeInstanceId,
        action: options.action,
        args: options.args,
        status: 'failed',
        error,
        ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
      })
    } catch {
      // 翻译失败可能正是因为 session 不存在或已停止，此时不能再写入 session history。
    }
  }

  private completeTranslatedFunctionCall(
    translation: AiRuntimeFunctionCallTranslation,
    result: AiRuntimeFunctionCallResult<unknown>,
    historyEntryId: string,
    metadata: Record<string, unknown> | undefined,
  ): void {
    const resultMessage = this.createFunctionResultMessage({
      action: translation.action,
      result,
    })
    this.completeFunctionCall({
      instanceId: translation.context.instanceId,
      moduleId: translation.context.moduleId,
      moduleInstanceId: translation.context.moduleInstanceId,
      runtimeInstanceId: translation.context.runtimeInstanceId,
      historyEntryId,
      status: result.ok ? 'completed' : 'failed',
      result,
      resultMessage,
      ...(!result.ok ? { error: result } : {}),
      ...(metadata === undefined ? {} : { metadata }),
    })
  }

  /** 创建或更新 Started session。这里保存 AI 会话状态，不触碰模块运行状态。 */
  private createStartedSession(
    scope: AiRuntimeProjectModuleOptions,
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

  /** 将一条历史写入 session，并刷新 updatedAt。 */
  private storeHistoryEntry(session: AiRuntimeSessionRecord, entry: AiRuntimeHistoryEntry, timestamp: number): AiRuntimeSessionRecord {
    const updated: AiRuntimeSessionRecord = {
      ...session,
      updatedAt: timestamp,
      history: [
        ...session.history.map((item) => this.cloneHistoryEntry(item)),
        this.cloneHistoryEntry(entry),
      ],
    }
    this.storeSession(updated)
    return updated
  }

  /** 原地更新一条历史记录的快照；用于 requested -> completed/failed 的会话账本流转。 */
  private replaceHistoryEntry(
    session: AiRuntimeSessionRecord,
    index: number,
    entry: AiRuntimeHistoryEntry,
    timestamp: number,
  ): AiRuntimeSessionRecord {
    const history = session.history.map((item) => this.cloneHistoryEntry(item))
    history[index] = this.cloneHistoryEntry(entry)
    const updated: AiRuntimeSessionRecord = {
      ...session,
      updatedAt: timestamp,
      history,
    }
    this.storeSession(updated)
    return updated
  }

  /** 创建历史条目的公共 envelope。 */
  private historyEnvelope<TKind extends AiRuntimeHistoryEntryBase['kind']>(
    scope: AiRuntimeProjectModuleOptions,
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

  /** append 类 API 使用：要求 session 存在且处于 Started。 */
  private requireStartedSession(scope: AiRuntimeProjectModuleOptions): AiRuntimeSessionRecord {
    const normalized = this.normalizeScope(scope)
    const failure = this.getSessionFailure(normalized)
    if (failure !== null) {
      throw new Error(`${failure.code}: ${failure.msg}`)
    }
    this.bindSessionAliases(normalized)
    const sessionKey = AiRuntime.moduleScopeKey(normalized.moduleId, normalized.moduleInstanceId)
    return this.sessions.get(sessionKey) as AiRuntimeSessionRecord
  }

  /** translate 类 API 使用：按模块隔离键检查 session，并把状态问题转换成 LLM/tool 友好的结构化失败。 */
  private getSessionFailure(scope: AiRuntimeProjectModuleOptions): AiRuntimeFunctionCallFailure | null {
    const session = this.sessions.get(AiRuntime.moduleScopeKey(scope.moduleId, scope.moduleInstanceId))
    if (session === undefined) {
      return AiRuntime.createFailure(
        'SESSION_NOT_STARTED',
        `AI session for ${scope.moduleId}/${scope.moduleInstanceId} has not been started.`,
        'Call startInstance with the same moduleId and moduleInstanceId before translating function calls.',
      )
    }
    if (session.status !== 'Started') {
      return AiRuntime.createFailure(
        'SESSION_STOPPED',
        `AI session ${scope.instanceId} is ${session.status}.`,
        'Call startInstance again or create a new AI session before translating function calls.',
      )
    }
    return null
  }

  /** 保存 AI session，并维护技术 instanceId 到模块隔离键的兼容索引。 */
  private storeSession(session: AiRuntimeSessionRecord): void {
    const sessionKey = AiRuntime.moduleScopeKey(session.moduleId, session.moduleInstanceId)
    this.assertInstanceAliasesAvailable(session)
    this.sessions.set(sessionKey, session)
    this.bindSessionAliases(session)
  }

  /** 通过技术 instanceId 查找 session；instanceId 只是 alias，不是隔离主键。 */
  private getSessionByInstanceId(instanceId: string): AiRuntimeSessionRecord | undefined {
    const sessionKey = this.sessionScopesByInstanceId.get(instanceId)
    return sessionKey === undefined ? undefined : this.sessions.get(sessionKey)
  }

  /** 防止同一个 AI session id 被复用到另一个模块实例上。 */
  private assertSameSessionScope(session: AiRuntimeSessionRecord, scope: AiRuntimeProjectModuleOptions): void {
    if (session.moduleId !== scope.moduleId || session.moduleInstanceId !== scope.moduleInstanceId) {
      throw new Error(
        `AI session ${scope.instanceId} is already bound to ${session.moduleId}/${session.moduleInstanceId}, cannot bind to ${scope.moduleId}/${scope.moduleInstanceId}.`,
      )
    }
  }

  /** 克隆 session，避免外部修改 core 内部 ledger。 */
  private cloneSession(session: AiRuntimeSessionRecord): AiRuntimeSessionRecord {
    return {
      ...session,
      ...(session.reason === undefined ? {} : { reason: session.reason }),
      ...(session.stoppedAt === undefined ? {} : { stoppedAt: session.stoppedAt }),
      ...(session.latestProjection === undefined ? {} : { latestProjection: this.cloneProjection(session.latestProjection) }),
      history: session.history.map((entry) => this.cloneHistoryEntry(entry)),
    }
  }

  /** 克隆历史条目，包含 args/result/metadata 这类宿主对象。 */
  private cloneHistoryEntry(entry: AiRuntimeHistoryEntry): AiRuntimeHistoryEntry {
    return cloneRuntimeValue(entry)
  }

  /** 克隆知识投影；复用 projector 对模块和函数 exposure 的专用克隆逻辑。 */
  private cloneProjection(projection: AiRuntimeKnowledgeProjection): AiRuntimeKnowledgeProjection {
    return {
      scope: { ...projection.scope },
      module: this.projector.cloneModuleExposure(projection.module),
      promptSnapshot: projection.promptSnapshot,
      availableFunctions: this.projector.cloneExposure(projection.availableFunctions),
    }
  }

  /** 向 APP/宿主发布框架无关事件；监听器异常不影响 core 状态流转。 */
  private emitEvent(event: AiRuntimeEvent): void {
    if (this.eventListeners.size === 0) return
    for (const listener of Array.from(this.eventListeners)) {
      try {
        listener(cloneRuntimeValue(event))
      } catch {
        // Event consumers are observers; their failures must not mutate core behavior.
      }
    }
  }

  /** 创建注册方使用的模块绑定 API；只补齐 moduleId，不持有模块服务实例。 */
  private createRegisteredModuleApi(registration: AiModuleRegistration): AiRegisteredModuleApi {
    const moduleId = registration.moduleId
    return {
      moduleId,
      registration,
      getRegistration: () => this.getModuleOrThrow(moduleId),
      getRegistrationData: () => this.projector.createRegistrationData(this.getModuleOrThrow(moduleId)),
      getRegistrationStoreSnapshot: () => this.projector.createRegistrationStoreSnapshot(this.getModuleOrThrow(moduleId)),
      subscribe: (listener) => this.subscribe((event) => {
        if (event.moduleId === moduleId) listener(event)
      }),
      getSession: (instanceId) => this.getSession(instanceId),
      getSessionByModuleInstance: (moduleInstanceId) => this.getSessionByModuleScope({ moduleId, moduleInstanceId }),
      getSessionHistory: (instanceId) => this.getSessionHistory(instanceId),
      getSessionHistoryByModuleInstance: (moduleInstanceId) => this.getSessionHistoryByModuleScope({ moduleId, moduleInstanceId }),
      exportSessionSnapshot: (moduleInstanceId) => this.exportSessionSnapshot({ moduleId, moduleInstanceId }),
      hydrateSessionSnapshot: (snapshot) => {
        if (snapshot.session.moduleId !== moduleId) {
          throw new Error(`AI session snapshot moduleId must be ${moduleId}, got ${snapshot.session.moduleId}`)
        }
        return this.hydrateSessionSnapshot(snapshot)
      },
      appendMessage: (options) => this.appendMessage({ ...options, moduleId }),
      recordFunctionCallRequest: (options) => this.recordFunctionCallRequest({ ...options, moduleId }),
      completeFunctionCall: (options) => this.completeFunctionCall({ ...options, moduleId }),
      appendFunctionCall: (options) => this.appendFunctionCall({ ...options, moduleId }),
      startInstance: (options) => this.startInstance({ ...options, moduleId }),
      stopInstance: (options) => this.stopInstance({ ...options, moduleId }),
      projectModule: (options) => this.projectModule({ ...options, moduleId }),
      translateFunctionCall: (options) => this.translateFunctionCall({ ...options, moduleId }),
      executeFunctionCall: (options) => this.executeFunctionCall({ ...options, moduleId }),
      createFunctionResultMessage: (options) => this.createFunctionResultMessage(options),
    }
  }

  /** 读取模块注册；未知模块直接抛错，避免生成空投影。 */
  private getModuleOrThrow(moduleId: string): AiModuleRegistration {
    const module = this.modules.get(moduleId)
    if (module === undefined) {
      throw new Error(`Unknown AI module registration: ${moduleId}`)
    }
    return module
  }

  /** 归一化 start/project scope，确保 instanceId 和 runtimeInstanceId 都有稳定值。 */
  private normalizeScope(options: AiRuntimeStartInstanceOptions | AiRuntimeProjectModuleOptions): AiRuntimeProjectModuleOptions {
    const instanceId = options.instanceId ?? options.moduleInstanceId
    AiRuntime.assertNonEmptyId('moduleId', options.moduleId)
    AiRuntime.assertNonEmptyId('moduleInstanceId', options.moduleInstanceId)
    AiRuntime.assertNonEmptyId('instanceId', instanceId)
    AiRuntime.assertNonEmptyId('runtimeInstanceId', options.runtimeInstanceId ?? instanceId)
    return {
      moduleId: options.moduleId,
      moduleInstanceId: options.moduleInstanceId,
      instanceId,
      runtimeInstanceId: options.runtimeInstanceId ?? instanceId,
    }
  }

  /** start 会保留同一模块实例的历史，但允许调用方切换新的技术 envelope alias。 */
  private normalizeStartScope(
    options: AiRuntimeStartInstanceOptions,
    previous: AiRuntimeSessionRecord | undefined,
  ): AiRuntimeProjectModuleOptions {
    const instanceId = options.instanceId ?? previous?.instanceId ?? options.moduleInstanceId
    const runtimeInstanceId = options.runtimeInstanceId
      ?? (options.instanceId !== undefined ? instanceId : previous?.runtimeInstanceId)
      ?? instanceId
    return this.normalizeScope({
      moduleId: options.moduleId,
      moduleInstanceId: options.moduleInstanceId,
      instanceId,
      runtimeInstanceId,
    })
  }

  /** 确保同一个技术 alias 不会被复用到另一个模块隔离键，避免 session 查询串线。 */
  private assertInstanceAliasesAvailable(scope: AiRuntimeProjectModuleOptions): void {
    const sessionKey = AiRuntime.moduleScopeKey(scope.moduleId, scope.moduleInstanceId)
    this.assertInstanceAliasAvailable(scope.instanceId, sessionKey)
    if (scope.runtimeInstanceId !== scope.instanceId) {
      this.assertInstanceAliasAvailable(scope.runtimeInstanceId, sessionKey)
    }
  }

  /** 把 instanceId/runtimeInstanceId 作为兼容 alias 绑定到同一模块隔离键。 */
  private bindSessionAliases(scope: AiRuntimeProjectModuleOptions): void {
    const sessionKey = AiRuntime.moduleScopeKey(scope.moduleId, scope.moduleInstanceId)
    this.assertInstanceAliasesAvailable(scope)
    this.sessionScopesByInstanceId.set(scope.instanceId, sessionKey)
    if (scope.runtimeInstanceId !== scope.instanceId) {
      this.sessionScopesByInstanceId.set(scope.runtimeInstanceId, sessionKey)
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

  /** 创建会话生命周期快照；调用方拿到的是本次 start/stop 写入 core session 后的同步快照。 */
  private createLifecycleSnapshot(
    scope: AiRuntimeProjectModuleOptions,
    status: AiRuntimeInstanceLifecycleSnapshot['status'],
    reason: string | undefined,
    timestamp = this.now(),
  ): AiRuntimeInstanceLifecycleSnapshot {
    return {
      ...scope,
      status,
      updatedAt: timestamp,
      ...(reason === undefined ? {} : { reason }),
    }
  }

  /**
   * 准备注册方执行函数时使用的参数。
   *
   * effectiveArgs 用于包含上下文参数的 schema 校验；executionArgs 会剥离
   * core 注入的上下文参数，避免注册方函数收到 LLM-facing 包装字段。
   */
  private prepareExecutionArgs(
    scope: AiRuntimeProjectModuleOptions,
    exposure: AiRuntimeFunctionExposure,
    rawArgs: unknown,
    activePath: readonly AiModuleInstanceBinding[],
  ): {
    effectiveArgs: Record<string, unknown>
    executionArgs: unknown
    moduleInstances: Readonly<Record<string, string>>
  } | AiRuntimeFunctionCallFailure {
    const args = this.isRecord(rawArgs) ? { ...rawArgs } : rawArgs
    const effectiveArgs = this.isRecord(args) ? { ...args } : {}
    let executionArgs = this.isRecord(args) ? { ...args } : args
    const moduleInstances: Record<string, string> = {}

    for (const param of exposure.contextParams) {
      const active = this.resolveActiveBinding(scope, activePath, param.modulePath, param.paramName)
      const fromArgs = this.isRecord(rawArgs) ? rawArgs[param.paramName] : undefined
      if (fromArgs !== undefined && typeof fromArgs !== 'string') {
        return AiRuntime.createFailure(
          'INVALID_ARGS',
          `${exposure.action} expects ${param.paramName} to be a string module instance id.`,
          `Pass a string ${param.paramName}, or provide activePath for ${param.modulePath}.`,
        )
      }
      if (active !== undefined && fromArgs !== undefined && active.instanceId !== fromArgs) {
        return AiRuntime.createFailure(
          'CONTEXT_MISMATCH',
          `${exposure.action} received ${param.paramName}=${fromArgs}, but active path ${param.modulePath} is ${active.instanceId}.`,
          'Use the active module instance id or update activePath before retrying.',
        )
      }
      const value = fromArgs ?? active?.instanceId
      if (typeof value !== 'string' || value.trim().length === 0) {
        return AiRuntime.createFailure(
          'MISSING_CONTEXT_INSTANCE',
          `${exposure.action} requires module instance ${param.paramName} for ${param.modulePath}.`,
          `Pass ${param.paramName} in args or provide activePath for ${param.modulePath}.`,
        )
      }
      effectiveArgs[param.paramName] = value
      moduleInstances[param.paramName] = value
      if (this.isRecord(executionArgs)) {
        const { [param.paramName]: _unused, ...rest } = executionArgs
        void _unused
        executionArgs = rest
      }
    }

    return {
      effectiveArgs,
      executionArgs,
      moduleInstances,
    }
  }

  /** 规范化调用方传入的 active path，并补齐 paramName。 */
  private normalizeActivePath(
    module: AiRuntimeModuleExposure,
    bindings: readonly AiModuleInstanceBinding[],
  ): AiModuleInstanceBinding[] {
    return bindings.map((binding) => this.normalizeActivePathBinding(module, binding))
  }

  /** 规范化单条 active path 绑定；无法匹配模块路径时 fail-fast。 */
  private normalizeActivePathBinding(module: AiRuntimeModuleExposure, binding: AiModuleInstanceBinding): AiModuleInstanceBinding {
    const target = this.findModuleExposure(module, binding.modulePath)
    if (target === null) {
      throw new Error(`Unknown active path module: ${binding.modulePath}`)
    }
    const paramName = binding.paramName ?? target.instanceParam?.name
    if (paramName === undefined || paramName.trim().length === 0) {
      throw new Error(`Active path module ${binding.modulePath} does not declare instanceParam; pass paramName explicitly.`)
    }
    return {
      modulePath: binding.modulePath,
      instanceId: binding.instanceId,
      paramName,
    }
  }

  /** 按模块路径或参数名寻找活动实例；顶层模块实例默认来自当前 scope。 */
  private resolveActiveBinding(
    scope: AiRuntimeProjectModuleOptions,
    activePath: readonly AiModuleInstanceBinding[],
    modulePath: string,
    paramName: string,
  ): AiModuleInstanceBinding | undefined {
    const active = activePath.find((binding) => binding.modulePath === modulePath || binding.paramName === paramName)
    if (active !== undefined) return active
    if (modulePath === scope.moduleId) {
      return { modulePath, paramName, instanceId: scope.moduleInstanceId }
    }
    return undefined
  }

  /** 在注册树中按 action 拆出的 moduleIds 定位目标模块。 */
  private findModuleRegistration(module: AiModuleRegistration, moduleIds: readonly string[]): AiModuleRegistration | null {
    if (moduleIds.length === 0 || module.moduleId !== moduleIds[0]) return null
    let current: AiModuleRegistration = module
    for (const moduleId of moduleIds.slice(1)) {
      const child = (current.modules ?? []).find((candidate) => candidate.moduleId === moduleId)
      if (child === undefined) return null
      current = child
    }
    return current
  }

  /** 在注册树中按模块 ID 定位目标模块；新 action 格式用实例路径承载层级，因此模块 ID 需要唯一命中。 */
  private findModuleRegistrationByModuleId(module: AiModuleRegistration, moduleId: string): AiModuleRegistration | null {
    const found: AiModuleRegistration[] = []
    this.collectModuleRegistrationsById(module, moduleId, found)
    if (found.length === 1) return found[0] ?? null
    if (found.length > 1) {
      throw new Error(`Ambiguous AI module id in registration tree: ${moduleId}`)
    }
    return null
  }

  /** 递归收集指定模块 ID 的注册节点。 */
  private collectModuleRegistrationsById(module: AiModuleRegistration, moduleId: string, out: AiModuleRegistration[]): void {
    if (module.moduleId === moduleId) out.push(module)
    for (const child of module.modules ?? []) {
      this.collectModuleRegistrationsById(child, moduleId, out)
    }
  }

  /** 在投影函数列表中定位 LLM 请求的函数暴露。 */
  private findFunctionExposure(
    functions: readonly AiRuntimeFunctionExposure[],
    address: ReturnType<typeof AiInvocationProtocol.parseActionPath>,
    action: string,
  ): AiRuntimeFunctionExposure | undefined {
    if (address.format === 'legacy') {
      return functions.find((candidate) => candidate.action === action)
    }
    const found = functions.filter((candidate) => (
      candidate.moduleId === address.moduleId
      && AiInvocationProtocol.parseActionPath(candidate.action).function === address.function
    ))
    if (found.length > 1) {
      throw new Error(`Ambiguous AI function action: ${action}`)
    }
    return found[0]
  }

  /** 把新 action 前缀里的实例路径转换为 activePath 输入，供上下文参数解析复用。 */
  private mergeActionInstancePath(
    address: ReturnType<typeof AiInvocationProtocol.parseActionPath>,
    exposure: AiRuntimeFunctionExposure,
    activePath: readonly AiModuleInstanceBinding[],
    scope: AiRuntimeProjectModuleOptions,
  ): readonly AiModuleInstanceBinding[] | AiRuntimeFunctionCallFailure {
    if (address.format === 'legacy') return activePath
    const bindings: AiModuleInstanceBinding[] = []
    const contextParams = exposure.contextParams
    for (let index = 0; index < contextParams.length; index++) {
      const param = contextParams[index]
      const instanceId = address.instanceIds[index]
      if (param === undefined || instanceId === undefined) continue
      if (param.modulePath === scope.moduleId) continue
      const conflict = activePath.find((binding) => (
        binding.modulePath === param.modulePath || binding.paramName === param.paramName
      ))
      if (conflict !== undefined && conflict.instanceId !== instanceId) {
        return AiRuntime.createFailure(
          'CONTEXT_MISMATCH',
          `Action ${address.instanceIds.join('/')} uses ${param.paramName}=${instanceId}, but active path ${param.modulePath} is ${conflict.instanceId}.`,
          'Use the same child instance id in the action path and activePath, or refresh the activePath snapshot.',
        )
      }
      bindings.push({
        modulePath: param.modulePath,
        paramName: param.paramName,
        instanceId,
      })
    }
    return [...bindings, ...activePath]
  }

  /** 校验新 action 中的实例路径是否与函数上下文参数匹配。 */
  private validateActionInstancePath(
    address: ReturnType<typeof AiInvocationProtocol.parseActionPath>,
    exposure: AiRuntimeFunctionExposure,
    scope: AiRuntimeProjectModuleOptions,
  ): AiRuntimeFunctionCallFailure | null {
    if (address.format === 'legacy') return null
    const expectedLength = Math.max(1, exposure.contextParams.length)
    if (address.instanceIds.length !== expectedLength) {
      return AiRuntime.createFailure(
        'INVALID_ACTION_INSTANCE_PATH',
        `${exposure.action} expects ${expectedLength} instance id(s), but received ${address.instanceIds.length}.`,
        'Use rootInstance[/childInstance] from the projected action path; when an instance id contains / or @, keep it URI-encoded.',
      )
    }
    if (address.instanceIds[0] !== scope.moduleInstanceId) {
      return AiRuntime.createFailure(
        'CONTEXT_MISMATCH',
        `Action root instance ${address.instanceIds[0] ?? ''} does not match current root entity ${scope.moduleInstanceId}.`,
        'Use the root module instance id from the current AI session.',
      )
    }
    return null
  }

  /** 在投影树中按 modulePath 定位目标模块暴露项。 */
  private findModuleExposure(module: AiRuntimeModuleExposure, modulePath: string): AiRuntimeModuleExposure | null {
    if (module.modulePath === modulePath) return module
    for (const child of module.modules) {
      const found = this.findModuleExposure(child, modulePath)
      if (found !== null) return found
    }
    return null
  }

  /** 校验模块 ID、函数 ID、instanceParam 名称等路径段。 */
  private static assertId(kind: string, value: string): void {
    AiRuntime.assertNonEmptyId(kind, value)
    if (value.includes('/') || value.includes('@')) {
      throw new Error(`${kind} must not contain / or @: ${value}`)
    }
  }

  /** 校验普通 ID 非空；模块实例 ID 允许包含分隔符，进入 action 时会被 URI 编码。 */
  private static assertNonEmptyId(kind: string, value: string): void {
    if (value.trim().length === 0) {
      throw new Error(`${kind} must not be empty`)
    }
  }

  /** 顶层模块实例 scope 的索引键；只用于 AI session 查找，不代表模块状态。 */
  private static moduleScopeKey(moduleId: string, moduleInstanceId: string): string {
    return `${moduleId}\u0000${moduleInstanceId}`
  }

  /** 从 session/history entry 中取出 APP 可关联的通用 scope。 */
  private static scopeOf(scope: AiRuntimeInstanceScope): AiRuntimeInstanceScope {
    return {
      moduleId: scope.moduleId,
      moduleInstanceId: scope.moduleInstanceId,
      instanceId: scope.instanceId,
      runtimeInstanceId: scope.runtimeInstanceId,
    }
  }

  /** 恢复 session 快照后，继续追加历史时应使用的最小序号。 */
  private static nextHistorySeqAfter(session: AiRuntimeSessionRecord): number {
    return session.history.reduce((next, entry) => Math.max(next, entry.seq + 1), 1)
  }

  /** requested -> completed/failed 时合并宿主 metadata，避免覆盖 run/round 等诊断字段。 */
  private static mergeMetadata(
    previous: Record<string, unknown> | undefined,
    next: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (previous === undefined && next === undefined) return undefined
    return {
      ...(previous === undefined ? {} : cloneRuntimeValue(previous)),
      ...(next === undefined ? {} : cloneRuntimeValue(next)),
    }
  }

  /** 将实例路径、模块 ID 和函数 ID 拼成 LLM-facing action。 */
  private static actionOf(
    modulePath: string,
    functionId: string,
    scope: AiRuntimeProjectModuleOptions,
    contextParams: ReadonlyArray<{ modulePath: string; paramName: string }>,
  ): AiRuntimeAction {
    const modulePathParts = modulePath.split('/')
    const moduleId = modulePathParts[modulePathParts.length - 1] ?? modulePath
    const instancePath = AiRuntime.actionInstancePath(scope, contextParams)
    return `${instancePath}@${moduleId}@${functionId}`
  }

  /** 生成 action 前缀中的实例路径；未知子实例用参数名占位，等待 LLM 用真实实例 ID 替换。 */
  private static actionInstancePath(
    scope: AiRuntimeProjectModuleOptions,
    contextParams: ReadonlyArray<{ modulePath: string; paramName: string }>,
  ): string {
    if (contextParams.length === 0) return AiRuntime.encodeActionInstanceSegment(scope.moduleInstanceId)
    return contextParams.map((param) => (
      param.modulePath === scope.moduleId ? AiRuntime.encodeActionInstanceSegment(scope.moduleInstanceId) : `{${param.paramName}}`
    )).join('/')
  }

  /** 把模块实例 ID 编码成 action 路径段，避免 `/` 或 `@` 破坏 LLM 调用地址。 */
  private static encodeActionInstanceSegment(instanceId: string): string {
    return encodeURIComponent(instanceId)
  }

  /** 按消息角色推导来源，调用方也可以显式覆盖。 */
  private static defaultMessageSource(role: 'system' | 'user' | 'assistant'): 'system' | 'ui' | 'llm' {
    if (role === 'user') return 'ui'
    if (role === 'assistant') return 'llm'
    return 'system'
  }

  /** 创建统一失败对象。 */
  private static createFailure(code: string, msg: string, fix: string): AiRuntimeFunctionCallFailure {
    return { ok: false, code, msg, fix }
  }

  /** 把模块落点返回值归一成函数调用结果。 */
  private static normalizeFunctionCallResult(value: unknown, action: string): AiRuntimeFunctionCallResult<unknown> {
    if (AiRuntime.isFunctionCallResult(value)) return value
    return {
      ok: true,
      data: value,
      summary: `${action} executed`,
    }
  }

  private static isFunctionCallResult(value: unknown): value is AiRuntimeFunctionCallResult<unknown> {
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

  /** 将任意执行结果转为 tool result 字符串；这里只处理序列化，不解释领域含义。 */
  private static stringifyFunctionResult(result: unknown): string {
    if (typeof result === 'string') return result
    try {
      const seen = new WeakSet<object>()
      const serialized: unknown = JSON.stringify(result, (_key, value: unknown) => {
        if (typeof value === 'bigint') return value.toString()
        if (typeof value !== 'object' || value === null) return value
        if (seen.has(value)) return '[Circular]'
        seen.add(value)
        return value
      })
      return typeof serialized === 'string' ? serialized : String(result)
    } catch {
      return String(result)
    }
  }

  /** 判断 unknown 是否为普通对象。 */
  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }
}
