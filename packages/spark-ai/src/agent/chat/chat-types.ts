/**
 * ═══════════════════════════════════════════════════════════════
 * agent/chat/chat-types.ts — 聊天请求/响应 DTO
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】Host 层的聊天消息类型定义。这些 DTO 在 UI 层、transport 层、
 *   和工具循环之间传递，不依赖任何框架（React/Vue 无关）。
 *
 * 【核心类型】
 *   AiAgentChatMessage  — 单条聊天消息（role + content）
 *   AiAgentChatRequest  — 聊天请求（历史消息 + 回调）
 *   AiAgentStreamEvent  — AI turn 事件（来自 APP 公共 SSE 的事件单元）
 *   AiAgentToolCallRecord — 工具调用记录（用于前端展示/调试）
 *   AiAgentTurnMeta     — 轮次元数据（turnId、时间戳等）
 *
 * 【消费方】business-session、tool-loop-runner、turn-event-collector、UI 层
 * ═══════════════════════════════════════════════════════════════
 */

import type {
  AiAgentBeforeFunctionCallDirective,
  AiAgentBeforeFunctionCallOptions,
} from '../business/lifecycle-types'
import type { AiAgentFunctionCallResult } from '../session/session-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 聊天消息与请求
// ═══════════════════════════════════════════════════════════════

/** 单条聊天消息（对齐 OpenAI message 格式），判别联合：role='tool' 必须有 tool_call_id */
export type AiAgentChatMessage = Readonly<{
  role: 'user' | 'assistant' | 'system'
  content: string
}> | Readonly<{
  role: 'tool'
  content: string
  tool_call_id: string
}>

/**
 * 聊天请求。
 *
 * 必填：
 *   historyMsgs — 历史消息列表（包含当前用户输入）
 *
 * 可选回调（流式传输）：
 *   onReasoning — 推理过程增量回调
 *   onDelta     — 文本增量回调
 *   onUsage     — token 用量回调
 *   onStreamEvent — 原始 AI turn 事件回调
 *   onToolCall  — 工具调用记录回调
 *   beforeFunctionCall — 本次请求级工具执行前置裁决
 *
 * 可选控制：
 *   turn        — 轮次元数据（未提供时自动生成）
 *   systemPrompt — 额外的系统提示词
 *   signal      — AbortSignal（取消请求）
 */
export type AiAgentChatRequest = Readonly<{
  historyMsgs: readonly AiAgentChatMessage[]
  turn?: AiAgentTurnMeta
  systemPrompt?: string
  signal?: AbortSignal
  onReasoning?: (reasoning: string) => void
  onDelta?: (delta: string) => void
  onUsage?: (usageRaw: Record<string, unknown>) => void
  onStreamEvent?: (event: AiAgentStreamEvent) => void
  onToolCall?: (record: AiAgentToolCallRecord) => void
  beforeFunctionCall?: (
    options: AiAgentBeforeFunctionCallOptions,
  ) => AiAgentBeforeFunctionCallDirective | Promise<AiAgentBeforeFunctionCallDirective>
}>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · turn stream 事件
// ═══════════════════════════════════════════════════════════════

/**
 * AI turn 事件（一次模型 turn 在 APP 公共 SSE 中的事件单元）。
 * type      — 事件类型（delta / reasoning / usage / result / error / tool-result 等）
 * data      — 事件数据（字符串）
 * turnKey   — turn 隔离键（kind + 顶层 instanceId + turnId）
 * streamKey — turn 内流键（turnKey + streamId）
 * scope     — 事件作用域（含 kind / 顶层 instanceId / eventModuleId / turnId）
 */
export type AiAgentStreamEvent = Readonly<{
  type: string
  data: unknown
  turnKey: string
  streamKey: string
  scope: {
    readonly businessRegistrationId: string
    readonly businessInstanceId: string
    readonly eventModuleId: string
    readonly turnId: string
  }
}>

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 工具调用记录
// ═══════════════════════════════════════════════════════════════

/**
 * 工具调用记录（用于前端展示和调试）。
 * 每次 OpenAI function tool 调用完成后，tool-loop-runner 通过 onToolCall 回调
 * 将本记录传给业务方。
 */
export type AiAgentToolCallRecord = Readonly<{
  toolName: string
  args: unknown
  turnId: string
  round: number
  callId?: string
  status: 'success' | 'error'
  result: AiAgentFunctionCallResult<unknown>
  durationMs: number
}>

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 轮次元数据
// ═══════════════════════════════════════════════════════════════

/**
 * 轮次元数据。
 * turnId          — 轮次 ID（UUID）
 * seq             — 序号
 * baseRevision    — 基础版本号（历史消息数 - 1）
 * queuedAt        — 排队时间（ISO 字符串）
 * startedAt       — 开始时间（ISO 字符串）
 * maxParallelTurns — 最大并行轮次（当前固定为 1）
 */
export type AiAgentTurnMeta = Readonly<{
  turnId: string
  seq: number
  baseRevision: number
  queuedAt: string
  startedAt: string
  maxParallelTurns: number
}>
