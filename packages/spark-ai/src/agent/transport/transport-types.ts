/**
 * ═══════════════════════════════════════════════════════════════
 * agent/transport/transport-types.ts — 传输层类型契约
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】Host 层与 APP 层的 AI turn 契约。定义工具规约形状、
 *   消息格式、AI turn 命令/事件类型，以及 APP 层注入的 I/O 回调。
 *
 * 【核心类型】
 *   AiAgentTransportToolSpec   — 工具规约（对齐 OpenAI function tool spec）
 *   AiAgentTransportMessage    — 传输层消息（含 tool_calls / tool_call_id）
 *   AiAgentTransportToolCall   — 传输层工具调用
 *   AiAgentStreamTurnInput     — AI turn 启动输入
 *   AiAgentStreamTurnResult    — AI turn 汇总结果
 *   AiAgentTurnCallbacks       — APP 层实现的 turn I/O 回调
 *
 * 【与工具 runtime 的关系】
 *   本层的 ToolSpec 直接承载 runtime 输出的固定工具 JSON Schema。
 *
 * 【消费方】business-session、tool-loop-runner、APP 层 ai-turn bridge
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiAgentScope } from '../business/scope-types'
import type { AiAgentStreamEvent, AiAgentTurnMeta } from '../chat/chat-types'
import type { AiJsonSchemaObject } from '../../json'
import type {
  AiAgentAppSseEvent,
  AiAgentAppSseEventName,
} from './app-sse-events'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 工具规约与消息格式
// ═══════════════════════════════════════════════════════════════

/** 传输层工具规约（对齐 OpenAI function tool spec） */
export type AiAgentTransportToolSpec = Readonly<{
  type: 'function'
  function: {
    readonly name: string
    readonly description: string
    readonly parameters: AiJsonSchemaObject
    /** OpenAI strict function calling：要求模型参数严格匹配 JSON Schema。 */
    readonly strict?: boolean
  }
}>

/** 传输层消息（对齐 OpenAI message 格式，支持 tool_calls） */
export type AiAgentTransportMessage = Readonly<{
  /** system 对齐 OpenAI，但 SPARK 当前轮次 system prompt 走 AiAgentStreamTurnInput.systemPrompt */
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: readonly AiAgentTransportToolCall[]
}>

/** 传输层工具调用 */
export type AiAgentTransportToolCall = Readonly<{
  id: string
  type: 'function'
  function: {
    readonly name: string
    readonly arguments: string
  }
}>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · AI turn 命令与事件
// ═══════════════════════════════════════════════════════════════

/** AI turn 启动输入（模型事件通过 APP 公共 SSE 返回） */
export type AiAgentStreamTurnInput = Readonly<{
  sessionId: string
  scope: AiAgentScope
  turn: AiAgentTurnMeta
  systemPrompt: string
  tools: readonly AiAgentTransportToolSpec[]
  messages: readonly AiAgentTransportMessage[]
  signal?: AbortSignal
  onStreamEvent?: (event: AiAgentStreamEvent) => void
  onDelta?: (delta: string) => void
  onReasoning?: (reasoning: string) => void
  onUsage?: (usage: Record<string, unknown>) => void
}>

/** 后端 V4 会话准备输入；用于在 executeTurn 前显式确保 session 存在且 scope 正确。 */
export type AiAgentPrepareSessionInput = Readonly<{
  sessionId: string
  scope: AiAgentScope
  systemPrompt: string
  tools: readonly AiAgentTransportToolSpec[]
  signal?: AbortSignal
}>

/** AI turn 汇总结果 */
export type AiAgentStreamTurnResult = Readonly<{
  text: string
  reasoning?: string
  toolCalls: readonly AiAgentTransportToolCall[]
  /** true 表示 transport 已把本轮 assistant 消息写入后端历史；工具循环只需追加 tool 结果。 */
  assistantMessagePersisted?: boolean
}>

/** 追加消息请求输入 */
export type AiAgentAppendMessagesInput = Readonly<{
  sessionId: string
  scope: AiAgentScope
  turn: AiAgentTurnMeta
  messages: readonly AiAgentTransportMessage[]
}>

export type AiAgentAppSseEventSource = Readonly<{
  on(name: AiAgentAppSseEventName, listener: (event: AiAgentAppSseEvent) => void): () => void
}>

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · APP 层 I/O 回调
// ═══════════════════════════════════════════════════════════════

/** APP 层实现的三个 I/O 操作；spark-ai 只调用，不实现网络请求。 */
export type AiAgentTurnCallbacks = Readonly<{
  /** 可选：在 turn 前显式准备后端 session。 */
  prepareSession?: (input: AiAgentPrepareSessionInput) => Promise<void>
  /** 启动一次模型 turn，聚合 APP SSE 事件后返回结果。 */
  executeTurn: (input: AiAgentStreamTurnInput) => Promise<AiAgentStreamTurnResult>
  /** 将工具调用结果同步到后端会话。 */
  appendMessages: (input: AiAgentAppendMessagesInput) => Promise<void>
}>
