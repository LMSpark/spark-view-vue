/**
 * AI Host 跨框架协议类型。
 *
 * 定义业务运行时、作用域、传输层和选项的接口契约，
 * 不依赖任何前端框架（Vue/React/Angular）。
 * 具体框架的实现只需满足这些接口的结构类型。
 */

import type {
  AiRuntimeKnowledgeProjection,
  AiRuntimeFunctionCallResult,
  AiRuntimeHistoryEntry,
  AiRuntimeMessageHistoryEntry,
  AiRuntimeSessionRecord,
  AiRuntimeStartSessionResult,
} from '../protocol/runtime-contracts'
import type { AiModuleRegistrationData } from '../protocol/business-registration'
export type { AiModuleRegistrationData }

// ── 聊天请求（框架无关的最小接口） ──

export interface AiHostChatRequest {
  historyMsgs: Array<{ readonly role: 'user' | 'assistant' | 'system'; readonly content: string }>
  turn?: AiHostTurnMeta
  systemPrompt?: string
  signal?: AbortSignal
  onReasoning?: (reasoning: string) => void
  onDelta?: (delta: string) => void
  onUsage?: (usageRaw: Record<string, unknown>) => void
  onSseEvent?: (event: AiHostSseEvent) => void
  onFcCall?: (record: AiHostFcCallRecord) => void
}

export interface AiHostSseEvent {
  type: string
  data: unknown
  streamKey: string
  scope: {
    businessRegistrationId: string
    businessInstanceId: string
    eventModuleId: string
    turnId: string
  }
}

export interface AiHostFcCallRecord {
  toolName: string
  args: unknown
  turnId: string
  round: number
  callId?: string
  status: 'success' | 'error'
  result: AiRuntimeFunctionCallResult<unknown>
  durationMs: number
}

// ── 业务作用域 ──

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

// ── 业务运行时上下文 ──

export interface AiHostBusinessRuntimeContext {
  readonly moduleId: string
  readonly moduleInstanceId: string
  readonly instanceId: string
}

// ── 运行时方法选项 ──

export interface AiHostBusinessAppendMessageOptions extends AiHostBusinessRuntimeContext {
  readonly role: 'system' | 'user' | 'assistant'
  readonly content: string
  readonly source?: 'system' | 'ui' | 'llm' | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

export interface AiHostBusinessExecuteFunctionCallOptions extends AiHostBusinessRuntimeContext {
  readonly action: string
  readonly args: unknown
  readonly projection?: AiRuntimeKnowledgeProjection | undefined
}

export type AiHostBusinessLifecycleStatus = 'continue' | 'complete' | 'abort'

export interface AiHostBusinessLifecycleDirective {
  readonly status: AiHostBusinessLifecycleStatus
  readonly reason?: string | undefined
  readonly finalAssistantMessage?: string | undefined
  readonly releaseInstance?: boolean | undefined
}

export interface AiHostBusinessAfterFunctionCallOptions extends AiHostBusinessRuntimeContext {
  readonly action: string
  readonly args: unknown
  readonly result: AiRuntimeFunctionCallResult<unknown>
}

// ── 业务运行时契约 ──

export interface AiHostBusinessRuntime {
  readonly moduleId: string
  getRegistrationData(): AiModuleRegistrationData
  getSystemPrompt?(context: AiHostBusinessRuntimeContext): string | undefined
  startSession(context: AiHostBusinessRuntimeContext): Promise<AiRuntimeStartSessionResult>
  appendMessage(options: AiHostBusinessAppendMessageOptions): AiRuntimeMessageHistoryEntry
  getSession?(context: AiHostBusinessRuntimeContext): AiRuntimeSessionRecord | null
  listSessions(): readonly AiRuntimeSessionRecord[]
  executeFunctionCall(options: AiHostBusinessExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallResult<unknown>>
  afterFunctionCall?(options: AiHostBusinessAfterFunctionCallOptions): AiHostBusinessLifecycleDirective | Promise<AiHostBusinessLifecycleDirective>
  endBusinessInstance?(context: AiHostBusinessRuntimeContext, directive: AiHostBusinessLifecycleDirective): void | Promise<void>
  getSessionHistory(context: AiHostBusinessRuntimeContext): readonly AiRuntimeHistoryEntry[]
  releaseModuleInstance?(moduleInstanceId: string): void
}

// ── Turn 元信息 ──

export interface AiHostTurnMeta {
  readonly turnId: string
  readonly seq: number
  readonly baseRevision: number
  readonly queuedAt: string
  readonly startedAt: string
  readonly maxParallelTurns: number
}

// ── 传输层类型 ──

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

// ── 传输层契约 ──

export interface AiHostTransport {
  streamTurn(input: AiHostStreamTurnInput): Promise<AiHostStreamTurnResult>
  appendMessages(input: AiHostAppendMessagesInput): Promise<void>
}

// ── 宿主选项 ──

export interface AiHostOptions {
  readonly registry: {
    get(moduleId: string): AiHostBusinessRuntime | undefined
    list(): readonly AiHostBusinessRuntime[]
  }
  readonly transport: AiHostTransport
  readonly maxToolRounds?: number | undefined
}

// ── 宿主发送器 ──

export type AiHostSender = (request: AiHostChatRequest) => Promise<void>

export interface AiHostBusinessSession {
  readonly target: AiHostBusinessTarget
  readonly scope: AiHostBusinessScope
  readonly storageKey: string
  readonly sessionId: string
  readonly pageId: string
  readonly sender: AiHostSender
  start(): Promise<void>
  getSessionRecord(): AiRuntimeSessionRecord | null
  send(request: AiHostChatRequest): Promise<void>
}

// ── 已选业务 ──

export interface AiHostSelectedBusiness {
  readonly runtime: AiHostBusinessRuntime
  readonly scope: AiHostBusinessScope
  projection: AiRuntimeKnowledgeProjection
}
