/**
 * ═══════════════════════════════════════════════════════════════
 * host/transport/transport-types.ts — 传输层类型契约
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】Host 层与 APP 层的 AI turn 契约。定义工具规约形状、
 *   消息格式、AI turn 命令/事件类型，以及 APP 层注入的 I/O 回调。
 *
 * 【核心类型】
 *   AiHostTransportToolSpec   — 工具规约（对齐 OpenAI function tool spec）
 *   AiHostTransportMessage    — 传输层消息（含 tool_calls / tool_call_id）
 *   AiHostTransportToolCall   — 传输层工具调用
 *   AiHostStreamTurnInput     — AI turn 启动输入
 *   AiHostStreamTurnResult    — AI turn 汇总结果
 *   AiHostTurnCallbacks       — APP 层实现的 turn I/O 回调
 *
 * 【与 module-semantic 的关系】
 *   本层的 ToolSpec 是 transport 专用形状（parameters 为 Record<string, unknown>），
 *   而 module-semantic 的 ModuleSemanticToolSpec 使用 LlmJsonSchemaObject。
 *   ModuleSemanticToolCodec 负责二者之间的转换。
 *
 * 【消费方】business-session、tool-loop-runner、APP 层 ai-turn bridge
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiHostBusinessScope } from '../business/business-types'
import type { AiHostStreamEvent, AiHostTurnMeta } from '../chat/chat-types'
import type {
  AiHostAppSseEvent,
  AiHostAppSseEventName,
} from './app-sse-events'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 工具规约与消息格式
// ═══════════════════════════════════════════════════════════════

/** 传输层工具规约（对齐 OpenAI function tool spec） */
export type AiHostTransportToolSpec = Readonly<{
  type: 'function'
  function: {
    readonly name: string
    readonly description: string
    readonly parameters: Record<string, unknown>
  }
}>

/** 传输层消息（对齐 OpenAI message 格式，支持 tool_calls） */
export type AiHostTransportMessage = Readonly<{
  role: string
  content: string
  tool_call_id?: string
  tool_calls?: readonly AiHostTransportToolCall[]
}>

/** 传输层工具调用 */
export type AiHostTransportToolCall = Readonly<{
  id?: string
  type?: string
  function?: {
    readonly name?: string
    readonly arguments?: string
  }
}>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · AI turn 命令与事件
// ═══════════════════════════════════════════════════════════════

/** AI turn 启动输入（模型事件通过 APP 公共 SSE 返回） */
export type AiHostStreamTurnInput = Readonly<{
  sessionId: string
  scope: AiHostBusinessScope
  turn: AiHostTurnMeta
  systemPrompt: string
  tools: readonly AiHostTransportToolSpec[]
  messages: readonly AiHostTransportMessage[]
  signal?: AbortSignal
  onStreamEvent?: (event: AiHostStreamEvent) => void
  onDelta?: (delta: string) => void
  onReasoning?: (reasoning: string) => void
  onUsage?: (usage: Record<string, unknown>) => void
}>

/** 后端 V4 会话准备输入；用于在 executeTurn 前显式确保 session 存在且 scope 正确。 */
export type AiHostPrepareSessionInput = Readonly<{
  sessionId: string
  scope: AiHostBusinessScope
  systemPrompt: string
  tools: readonly AiHostTransportToolSpec[]
  signal?: AbortSignal
}>

/** AI turn 汇总结果 */
export type AiHostStreamTurnResult = Readonly<{
  text: string
  reasoning?: string
  toolCalls: readonly AiHostTransportToolCall[]
}>

/** 追加消息请求输入 */
export type AiHostAppendMessagesInput = Readonly<{
  sessionId: string
  scope: AiHostBusinessScope
  turn: AiHostTurnMeta
  messages: readonly AiHostTransportMessage[]
}>

export type AiHostAppSseEventSource = Readonly<{
  on(name: AiHostAppSseEventName, listener: (event: AiHostAppSseEvent) => void): () => void
}>

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · APP 层 I/O 回调
// ═══════════════════════════════════════════════════════════════

/** APP 层实现的三个 I/O 操作；spark-ai 只调用，不实现网络请求。 */
export type AiHostTurnCallbacks = Readonly<{
  /** 可选：在 turn 前显式准备后端 session。 */
  prepareSession?: (input: AiHostPrepareSessionInput) => Promise<void>
  /** 启动一次模型 turn，聚合 APP SSE 事件后返回结果。 */
  executeTurn: (input: AiHostStreamTurnInput) => Promise<AiHostStreamTurnResult>
  /** 将工具调用结果同步到后端会话。 */
  appendMessages: (input: AiHostAppendMessagesInput) => Promise<void>
}>
