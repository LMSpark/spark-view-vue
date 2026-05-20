import type {
  AiModuleRegistration,
  AiRuntimeFunctionCallResult,
  AiRuntimeFunctionResultMessage,
  AiRuntimeKnowledgeProjection,
} from '../../protocol/runtime-contracts'
import type {
  AiRegisteredModuleAppendFunctionCallOptions,
  AiRegisteredModuleAppendMessageOptions,
  AiRegisteredModuleCompleteFunctionCallOptions,
  AiRegisteredModuleExecuteFunctionCallOptions,
  AiRegisteredModuleProjectKnowledgeOptions,
  AiRegisteredModuleRecordFunctionCallRequestOptions,
  AiRegisteredModuleStartSessionOptions,
  AiRegisteredModuleStopSessionOptions,
  AiRegisteredModuleTranslateFunctionCallOptions,
  AiRuntimeCreateFunctionResultMessageOptions,
  AiRuntimeFunctionCallTranslationResult,
} from '../../protocol/runtime-protocol'
import type {
  AiRuntimeFunctionCallHistoryEntry,
  AiRuntimeHistoryEntry,
  AiRuntimeMessageHistoryEntry,
  AiRuntimeSessionRecord,
  AiRuntimeStartSessionResult,
  AiRuntimeStopSessionResult,
} from '../../protocol/session-events'
import type { AiRegistrationRepository } from './ai-registration-repository'
import type { AiSessionLedger } from './ai-session-ledger'
import type { AiProjectionService } from './ai-projection-service'
import type { AiFunctionCallTranslator } from './ai-function-call-translator'
import type { AiFunctionCallExecutor } from './ai-function-call-executor'

/**
 * AI 已注册模块句柄。
 *
 * 职责：作为 AiRuntime.registerModule() 的返回值，是外部与特定模块交互的唯一公共路径。
 * 所有 session、projection、message、function-call 操作都必须通过此句柄访问。
 *
 * ┌───────────────────────────────────────────────────────┐
 * │                  AiRegisteredModule                    │
 * │                                                        │
 * │  会话管理：startSession() / stopSession()              │
 * │               getSession() / listSessions()            │
 * │               getSessionHistory()                      │
 * │                                                        │
 * │  消息操作：appendMessage() / recordFunctionCallRequest()│
 * │             completeFunctionCall() / appendFunctionCall()│
 * │                                                        │
 * │  知识投射：projectKnowledge()                           │
 * │                                                        │
 * │  函数调用：translateFunctionCall() / executeFunctionCall()│
 * │             createFunctionResultMessage()              │
 * └───────────────────────────────────────────────────────┘
 */

export class AiRegisteredModule {
  readonly moduleId: string // 模块标识符

  readonly registration: AiModuleRegistration

  constructor(
    private readonly registrations: AiRegistrationRepository,
    private readonly sessions: AiSessionLedger,
    private readonly projections: AiProjectionService,
    private readonly translator: AiFunctionCallTranslator,
    private readonly executor: AiFunctionCallExecutor,
    registration: AiModuleRegistration,
  ) {
    this.registration = registration
    this.moduleId = registration.moduleId
  }

  // ── 查询 ──

  /** 获取模块注册信息（不存在则抛出） */
  getRegistration(): AiModuleRegistration {
    return this.registrations.getModuleOrThrow(this.moduleId)
  }

  /** 获取指定模块实例的会话记录 */
  getSession(moduleInstanceId: string /* 模块实例标识符 */): AiRuntimeSessionRecord | null {
    return this.sessions.getSession(this.moduleId, moduleInstanceId)
  }

  /** 列出该模块的所有会话 */
  listSessions(): readonly AiRuntimeSessionRecord[] {
    return this.sessions.listSessions(this.moduleId)
  }

  /** 获取指定会话的历史记录 */
  getSessionHistory(moduleInstanceId: string /* 模块实例标识符 */): readonly AiRuntimeHistoryEntry[] {
    return this.sessions.getSessionHistory(this.moduleId, moduleInstanceId)
  }

  // ── 消息操作 ──

  /** 追加消息到会话历史 */
  appendMessage(options: AiRegisteredModuleAppendMessageOptions): AiRuntimeMessageHistoryEntry {
    return this.sessions.appendMessage({ ...options, moduleId: this.moduleId })
  }

  /** 记录函数调用请求（状态: requested） */
  recordFunctionCallRequest(
    options: AiRegisteredModuleRecordFunctionCallRequestOptions,
  ): AiRuntimeFunctionCallHistoryEntry {
    return this.sessions.recordFunctionCallRequest({ ...options, moduleId: this.moduleId })
  }

  /** 完成函数调用（更新状态为 completed/failed） */
  completeFunctionCall(
    options: AiRegisteredModuleCompleteFunctionCallOptions,
  ): AiRuntimeFunctionCallHistoryEntry {
    return this.sessions.completeFunctionCall({ ...options, moduleId: this.moduleId })
  }

  /** 追加函数调用记录到历史 */
  appendFunctionCall(options: AiRegisteredModuleAppendFunctionCallOptions): AiRuntimeFunctionCallHistoryEntry {
    return this.sessions.appendFunctionCall({ ...options, moduleId: this.moduleId })
  }

  // ── 会话管理 ──

  /**
   * 启动模块会话。
   * 流程：校验注册 → prepareStartScope → projectKnowledge → startSession → 返回投影。
   */
  async startSession(options: AiRegisteredModuleStartSessionOptions): Promise<AiRuntimeStartSessionResult> {
    this.getRegistration()
    const scope = this.sessions.prepareStartScope({ ...options, moduleId: this.moduleId })
    const projection = await this.projections.projectKnowledge(scope)
    return this.sessions.startSession(scope, projection, options.reason)
  }

  /** 停止模块会话 */
  stopSession(options: AiRegisteredModuleStopSessionOptions): AiRuntimeStopSessionResult {
    this.getRegistration()
    return this.sessions.stopSession({ ...options, moduleId: this.moduleId })
  }

  // ── 知识投射 & 函数调用 ──

  /** 投射模块知识 → 返回 LLM 可用的知识投影 */
  projectKnowledge(options: AiRegisteredModuleProjectKnowledgeOptions): Promise<AiRuntimeKnowledgeProjection> {
    return this.projections.projectKnowledge({ ...options, moduleId: this.moduleId })
  }

  /** 翻译函数调用：action 字符串 → 可执行的翻译结果 */
  translateFunctionCall(
    options: AiRegisteredModuleTranslateFunctionCallOptions,
  ): Promise<AiRuntimeFunctionCallTranslationResult> {
    return this.translator.translateFunctionCall({ ...options, moduleId: this.moduleId })
  }

  /** 执行函数调用：翻译 → 记录 → 校验 → 运行 → 完成 */
  executeFunctionCall(
    options: AiRegisteredModuleExecuteFunctionCallOptions,
  ): Promise<AiRuntimeFunctionCallResult<unknown>> {
    return this.executor.executeFunctionCall({ ...options, moduleId: this.moduleId })
  }

  /** 创建函数结果消息（用于 appendMessage 追加） */
  createFunctionResultMessage(
    options: AiRuntimeCreateFunctionResultMessageOptions,
  ): AiRuntimeFunctionResultMessage {
    return this.executor.createFunctionResultMessage(options)
  }
}
