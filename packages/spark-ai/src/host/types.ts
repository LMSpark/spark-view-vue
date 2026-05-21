/**
 * AI Host 跨框架协议类型。
 *
 * Host 只面向 module-semantic:业务注册提供 ModuleSemanticRuntime,
 * Host 负责会话、传输、工具循环和审计记录。
 */

import type { LlmJsonValue } from '../schema'
import type { ModuleSemanticRuntime } from '../module-semantic/runtime/module-semantic-runtime'

// ═══════════════════════════════════════════════════════
// 1. 聊天请求 / SSE / 函数调用记录
// ═══════════════════════════════════════════════════════

export interface AiHostChatRequest {
  readonly historyMsgs: Array<{ readonly role: 'user' | 'assistant' | 'system'; readonly content: string }>
  readonly turn?: AiHostTurnMeta
  readonly systemPrompt?: string
  readonly signal?: AbortSignal
  readonly onReasoning?: (reasoning: string) => void
  readonly onDelta?: (delta: string) => void
  readonly onUsage?: (usageRaw: Record<string, unknown>) => void
  readonly onSseEvent?: (event: AiHostSseEvent) => void
  readonly onFcCall?: (record: AiHostFcCallRecord) => void
}

export interface AiHostSseEvent {
  readonly type: string
  readonly data: unknown
  readonly streamKey: string
  readonly scope: {
    readonly businessRegistrationId: string
    readonly businessInstanceId: string
    readonly eventModuleId: string
    readonly turnId: string
  }
}

export interface AiHostFcCallRecord {
  readonly toolName: string
  readonly args: unknown
  readonly turnId: string
  readonly round: number
  readonly callId?: string | undefined
  readonly status: 'success' | 'error'
  readonly result: AiHostFunctionCallResult<unknown>
  readonly durationMs: number
}

// ═══════════════════════════════════════════════════════
// 2. 业务作用域
// ═══════════════════════════════════════════════════════

export interface AiHostBusinessScope {
  readonly businessRegistrationId: string
  readonly businessInstanceId: string
  readonly instanceId: string
  readonly runtimeInstanceId: string
}

export interface AiHostBusinessTarget {
  readonly businessRegistrationId: string
  readonly businessInstanceId: string
}

export interface AiHostBusinessRuntimeContext {
  readonly moduleId: string
  readonly moduleInstanceId: string
  readonly instanceId: string
}

// ═══════════════════════════════════════════════════════
// 3. 函数结果 / 会话历史
// ═══════════════════════════════════════════════════════

export interface AiHostFunctionCallFailure {
  readonly ok: false
  readonly code: string
  readonly msg: string
  readonly fix: string
}

export type AiHostFunctionCallResult<TData> = {
  readonly ok: true
  readonly data?: TData | undefined
  readonly summary?: string | undefined
} | AiHostFunctionCallFailure

export type AiHostSessionStatus = 'Started' | 'Stopped'
export type AiHostMessageRole = 'system' | 'user' | 'assistant'
export type AiHostMessageSource = 'system' | 'ui' | 'llm'
export type AiHostFunctionCallHistoryStatus = 'requested' | 'completed' | 'failed'

export interface AiHostHistoryEntryBase {
  readonly moduleId: string
  readonly moduleInstanceId: string
  readonly instanceId: string
  readonly runtimeInstanceId: string
  readonly id: string
  readonly seq: number
  readonly timestamp: number
}

export interface AiHostMessageHistoryEntry extends AiHostHistoryEntryBase {
  readonly kind: 'message'
  readonly role: AiHostMessageRole
  readonly source: AiHostMessageSource
  readonly content: string
  readonly metadata?: Record<string, unknown> | undefined
}

export interface AiHostFunctionCallHistoryEntry extends AiHostHistoryEntryBase {
  readonly kind: 'functionCall'
  readonly toolName: string
  readonly args: unknown
  readonly status: AiHostFunctionCallHistoryStatus
  readonly completedAt?: number | undefined
  readonly result?: unknown
  readonly error?: AiHostFunctionCallFailure | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

export type AiHostHistoryEntry = AiHostMessageHistoryEntry | AiHostFunctionCallHistoryEntry

export interface AiHostSessionRecord {
  readonly moduleId: string
  readonly moduleInstanceId: string
  readonly instanceId: string
  readonly runtimeInstanceId: string
  readonly status: AiHostSessionStatus
  readonly startedAt: number
  readonly updatedAt: number
  readonly stoppedAt?: number | undefined
  readonly reason?: string | undefined
  readonly history: readonly AiHostHistoryEntry[]
}

export interface AiHostStartSessionResult {
  readonly status: 'Started'
  readonly instanceId: string
  readonly moduleId: string
  readonly moduleInstanceId: string
  readonly session: AiHostSessionRecord
  readonly tools: readonly AiHostTransportToolSpec[]
}

// ═══════════════════════════════════════════════════════
// 4. 业务注册契约
// ═══════════════════════════════════════════════════════

export interface AiHostBusinessAppendMessageOptions extends AiHostBusinessRuntimeContext {
  readonly role: AiHostMessageRole
  readonly content: string
  readonly source?: AiHostMessageSource | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

export interface AiHostBusinessExecuteFunctionCallOptions extends AiHostBusinessRuntimeContext {
  readonly toolName: string
  readonly args: Readonly<Record<string, LlmJsonValue>>
}

export type AiHostBusinessLifecycleStatus = 'continue' | 'complete' | 'abort'

export interface AiHostBusinessLifecycleDirective {
  readonly status: AiHostBusinessLifecycleStatus
  readonly reason?: string | undefined
  readonly finalAssistantMessage?: string | undefined
  readonly releaseInstance?: boolean | undefined
}

export interface AiHostBusinessAfterFunctionCallOptions extends AiHostBusinessRuntimeContext {
  readonly toolName: string
  readonly args: Readonly<Record<string, LlmJsonValue>>
  readonly result: AiHostFunctionCallResult<unknown>
}

export interface AiHostBusinessRegistration {
  readonly moduleId: string
  readonly name: string
  readonly description: string
  readonly runtime: ModuleSemanticRuntime
  readonly sessionStore?: AiHostSessionStore | undefined
  readonly systemPrompt?: ((context: AiHostBusinessRuntimeContext) => string | undefined) | undefined
  readonly afterFunctionCall?: (
    options: AiHostBusinessAfterFunctionCallOptions,
  ) => AiHostBusinessLifecycleDirective | Promise<AiHostBusinessLifecycleDirective>
  readonly onStartSession?: (context: AiHostBusinessRuntimeContext) => void | Promise<void>
  readonly onEndBusinessInstance?: (
    context: AiHostBusinessRuntimeContext,
    directive: AiHostBusinessLifecycleDirective,
  ) => void | Promise<void>
  readonly releaseModuleInstance?: (moduleInstanceId: string) => void
}

export interface AiHostSessionStore {
  startSession(context: AiHostBusinessRuntimeContext): AiHostSessionRecord
  stopSession(context: AiHostBusinessRuntimeContext, reason?: string): AiHostSessionRecord | null
  getSession(context: AiHostBusinessRuntimeContext): AiHostSessionRecord | null
  listSessions(): readonly AiHostSessionRecord[]
  getSessionHistory(context: AiHostBusinessRuntimeContext): readonly AiHostHistoryEntry[]
  appendMessage(options: AiHostBusinessAppendMessageOptions): AiHostMessageHistoryEntry
  appendFunctionCall(options: {
    readonly moduleId: string
    readonly moduleInstanceId: string
    readonly instanceId: string
    readonly runtimeInstanceId: string
    readonly toolName: string
    readonly args: unknown
    readonly status?: AiHostFunctionCallHistoryStatus | undefined
    readonly result?: unknown
    readonly error?: AiHostFunctionCallFailure | undefined
    readonly metadata?: Record<string, unknown> | undefined
  }): AiHostFunctionCallHistoryEntry
}

// ═══════════════════════════════════════════════════════
// 5. Turn / 传输层
// ═══════════════════════════════════════════════════════

export interface AiHostTurnMeta {
  readonly turnId: string
  readonly seq: number
  readonly baseRevision: number
  readonly queuedAt: string
  readonly startedAt: string
  readonly maxParallelTurns: number
}

export interface AiHostTransportToolSpec {
  readonly type: 'function'
  readonly function: {
    readonly name: string
    readonly description: string
    readonly parameters: Record<string, unknown>
  }
}

export interface AiHostTransportMessage {
  readonly role: string
  readonly content: string
  readonly tool_call_id?: string | undefined
  readonly tool_calls?: readonly AiHostTransportToolCall[] | undefined
}

export interface AiHostTransportToolCall {
  readonly id?: string | undefined
  readonly type?: string | undefined
  readonly function?: {
    readonly name?: string | undefined
    readonly arguments?: string | undefined
  } | undefined
}

export interface AiHostStreamTurnInput {
  readonly sessionId: string
  readonly scope: AiHostBusinessScope
  readonly turn: AiHostTurnMeta
  readonly systemPrompt: string
  readonly tools: readonly AiHostTransportToolSpec[]
  readonly messages: readonly AiHostTransportMessage[]
  readonly signal?: AbortSignal | undefined
  readonly onSseEvent?: ((event: AiHostSseEvent) => void) | undefined
  readonly onDelta?: ((delta: string) => void) | undefined
  readonly onReasoning?: ((reasoning: string) => void) | undefined
  readonly onUsage?: ((usage: Record<string, unknown>) => void) | undefined
}

export interface AiHostStreamTurnResult {
  readonly text: string
  readonly reasoning?: string | undefined
  readonly toolCalls: readonly AiHostTransportToolCall[]
}

export interface AiHostAppendMessagesInput {
  readonly sessionId: string
  readonly scope: AiHostBusinessScope
  readonly turn: AiHostTurnMeta
  readonly messages: readonly AiHostTransportMessage[]
}

export interface AiHostTransport {
  streamTurn(input: AiHostStreamTurnInput): Promise<AiHostStreamTurnResult>
  appendMessages(input: AiHostAppendMessagesInput): Promise<void>
}

// ═══════════════════════════════════════════════════════
// 6. Host 选项 / 发送器 / 会话
// ═══════════════════════════════════════════════════════

export interface AiHostOptions {
  readonly registry: {
    get(moduleId: string): AiHostBusinessRegistration | undefined
    list(): readonly AiHostBusinessRegistration[]
  }
  readonly transport: AiHostTransport
  readonly maxToolRounds?: number | undefined
}

export interface AiHostSender {
  (request: AiHostChatRequest): Promise<void>
}

export interface AiHostBusinessSession {
  readonly target: AiHostBusinessTarget
  readonly scope: AiHostBusinessScope
  readonly storageKey: string
  readonly sessionId: string
  readonly pageId: string
  readonly sender: AiHostSender
  start(): Promise<void>
  getSessionRecord(): AiHostSessionRecord | null
  send(request: AiHostChatRequest): Promise<void>
}

export interface AiHostSelectedBusiness {
  readonly registration: AiHostBusinessRegistration
  readonly scope: AiHostBusinessScope
}
