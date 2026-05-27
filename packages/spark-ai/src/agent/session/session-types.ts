/**
 * ═══════════════════════════════════════════════════════════════
 * agent/session/session-types.ts — 会话记录类型与存储契约
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】Host 层的会话持久化抽象。定义了会话记录的数据结构、
 *   历史条目类型、以及 AiAgentSessionStore 抽象类（存储契约）。
 *
 * 【数据层次】
 *   AiAgentSessionStore (abstract class)     — 存储契约
 *     └─ AiAgentSessionRecord                — 会话记录（含历史列表）
 *          └─ AiAgentHistoryEntry            — 历史条目（message | functionCall）
 *               ├─ AiAgentMessageHistoryEntry      — 消息条目
 *               └─ AiAgentFunctionCallHistoryEntry — 工具调用条目
 *
 * 【关键设计】
 *   - AiAgentFunctionCallResult<T> 使用联合类型：ok:true 带 data/summary，ok:false 带 code/msg/fix/checks
 *   - AiAgentSessionStore 为抽象类（非 interface），允许子类继承默认行为
 *   - 历史条目按时间戳排序，id 由 store 实现分配
 *   - 历史会话是 Agent 能力诊断和再次接入同一会话的起点，业务 smoke 不另存完整历史副本
 *
 * 【消费方】default-session-store、business-session、tool-loop-runner
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiAgentAppendMessageOptions, AiAgentRuntimeContext } from '../business/scope-types'
import type { AiAgentTransportToolSpec } from '../transport/transport-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 工具调用结果
// ═══════════════════════════════════════════════════════════════

/** 工具调用失败结果 */
export type AiAgentFunctionCallCheck = Readonly<{
  level: 'error' | 'warn' | 'info'
  code: string
  message: string
  hint?: string
}>

export type AiAgentFunctionCallFailure = Readonly<{
  ok: false
  code: string
  msg: string
  fix: string
  checks?: readonly AiAgentFunctionCallCheck[]
}>

/**
 * 工具调用结果（联合类型）。
 * ok:true  → 成功，携带 data（可选）和 summary（可选）
 * ok:false → 失败，携带 code / msg / fix / checks（对齐 AiModuleResult 的错误 check，完整回传给 LLM）
 */
export type AiAgentFunctionCallResult<TData> = Readonly<{
  ok: true
  data?: TData
  summary?: string
}> | AiAgentFunctionCallFailure

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 会话状态与条目基础类型
// ═══════════════════════════════════════════════════════════════

export type AiAgentSessionStatus = 'Started' | 'Stopped'
export type AiAgentMessageRole = 'system' | 'user' | 'assistant'
export type AiAgentMessageSource = 'system' | 'ui' | 'llm'
export type AiAgentFunctionCallHistoryStatus = 'requested' | 'completed' | 'failed'

/** 历史条目公共字段 */
export type AiAgentHistoryEntryBase = Readonly<{
  moduleId: string
  moduleInstanceId: string
  instanceId: string
  runtimeInstanceId: string
  id: string
  seq: number
  timestamp: number
}>

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 历史条目
// ═══════════════════════════════════════════════════════════════

/** 消息历史条目（用户消息 / 助手回复 / 系统消息） */
export type AiAgentMessageHistoryEntry = AiAgentHistoryEntryBase & Readonly<{
  kind: 'message'
  role: AiAgentMessageRole
  source: AiAgentMessageSource
  content: string
  metadata?: Record<string, unknown>
}>

/** 工具调用历史条目（OpenAI function call 记录） */
export type AiAgentFunctionCallHistoryEntry = AiAgentHistoryEntryBase & Readonly<{
  kind: 'functionCall'
  toolName: string
  args: unknown
  status: AiAgentFunctionCallHistoryStatus
  completedAt?: number
  result?: unknown
  error?: AiAgentFunctionCallFailure
  metadata?: Record<string, unknown>
}>

/** 历史条目联合类型 */
export type AiAgentHistoryEntry = AiAgentMessageHistoryEntry | AiAgentFunctionCallHistoryEntry

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 会话记录
// ═══════════════════════════════════════════════════════════════

/** 会话记录：包含生命周期状态和历史条目，是 Agent 诊断与再次接入会话的根数据 */
export type AiAgentSessionRecord = Readonly<{
  moduleId: string
  moduleInstanceId: string
  instanceId: string
  runtimeInstanceId: string
  status: AiAgentSessionStatus
  startedAt: number
  updatedAt: number
  stoppedAt?: number
  reason?: string
  history: readonly AiAgentHistoryEntry[]
}>

/** 会话启动结果：返回给业务方的初始状态 */
export type AiAgentStartSessionResult = Readonly<{
  status: 'Started'
  instanceId: string
  moduleId: string
  moduleInstanceId: string
  session: AiAgentSessionRecord
  tools: readonly AiAgentTransportToolSpec[]
}>

// ═══════════════════════════════════════════════════════════════
// 第 5 节 · 工具调用追加选项
// ═══════════════════════════════════════════════════════════════

/** 向 sessionStore 追加工具调用记录的参数 */
export type AiAgentAppendFunctionCallOptions = AiAgentRuntimeContext & Readonly<{
  runtimeInstanceId: string
  toolName: string
  args: unknown
  status?: AiAgentFunctionCallHistoryStatus
  result?: unknown
  error?: AiAgentFunctionCallFailure
  metadata?: Record<string, unknown>
}>

// ═══════════════════════════════════════════════════════════════
// 第 6 节 · 会话存储抽象（契约）
// ═══════════════════════════════════════════════════════════════

/**
 * 会话存储抽象类。
 *
 * 定义了 Host 层所需的全部持久化操作。业务方可继承此类实现自定义存储
 * （如 localStorage、IndexedDB、服务端持久化），也可直接使用默认的
 * DefaultAiAgentSessionStore（纯内存实现）。
 *
 * 历史会话只属于 spark-ai：它支撑 Agent 能力诊断、失败回看和后续再次接入
 * 同一业务会话；业务包和 smoke 只能读取它，不应复制或维护第二份历史。
 *
 * 方法分类：
 *   生命周期 — startSession / stopSession / getSession / listSessions
 *   历史查询 — getSessionHistory
 *   追加记录 — appendMessage / appendFunctionCall
 */
export abstract class AiAgentSessionStore {
  /** 启动会话：创建新的会话记录 */
  public abstract startSession(context: AiAgentRuntimeContext): AiAgentSessionRecord
  /** 停止会话：标记为 Stopped，记录原因 */
  public abstract stopSession(context: AiAgentRuntimeContext, reason?: string): AiAgentSessionRecord | null
  /** 获取会话记录 */
  public abstract getSession(context: AiAgentRuntimeContext): AiAgentSessionRecord | null
  /** 列出所有会话 */
  public abstract listSessions(): readonly AiAgentSessionRecord[]
  /** 获取会话历史（所有条目） */
  public abstract getSessionHistory(context: AiAgentRuntimeContext): readonly AiAgentHistoryEntry[]
  /** 追加消息条目 */
  public abstract appendMessage(options: AiAgentAppendMessageOptions): AiAgentMessageHistoryEntry
  /** 追加工具调用条目 */
  public abstract appendFunctionCall(options: AiAgentAppendFunctionCallOptions): AiAgentFunctionCallHistoryEntry
}
