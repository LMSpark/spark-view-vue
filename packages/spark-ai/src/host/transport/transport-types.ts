/**
 * ═══════════════════════════════════════════════════════════════
 * host/transport/transport-types.ts — 传输层类型契约
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】Host 层与 AI 后端的通信契约。定义了工具规约形状、
 *   消息格式、流式请求/响应类型、以及 AiHostTransport 抽象类。
 *
 * 【核心类型】
 *   AiHostTransportToolSpec   — 工具规约（对齐 OpenAI function tool spec）
 *   AiHostTransportMessage    — 传输层消息（含 tool_calls / tool_call_id）
 *   AiHostTransportToolCall   — 传输层工具调用
 *   AiHostStreamTurnInput     — 流式请求输入
 *   AiHostStreamTurnResult    — 流式请求结果
 *   AiHostTransport (abstract) — 传输层抽象（streamTurn + appendMessages）
 *
 * 【与 module-semantic 的关系】
 *   本层的 ToolSpec 是 transport 专用形状（parameters 为 Record<string, unknown>），
 *   而 module-semantic 的 ModuleSemanticToolSpec 使用 LlmParameterSchemaRoot。
 *   ModuleSemanticToolCodec 负责二者之间的转换。
 *
 * 【消费方】fetch-transport、business-session、tool-loop-runner
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiHostBusinessScope } from '../business/business-types'
import type { AiHostSseEvent, AiHostTurnMeta } from '../chat/chat-types'

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
  tool_call_id?: string | undefined
  tool_calls?: readonly AiHostTransportToolCall[] | undefined
}>

/** 传输层工具调用 */
export type AiHostTransportToolCall = Readonly<{
  id?: string | undefined
  type?: string | undefined
  function?: {
    readonly name?: string | undefined
    readonly arguments?: string | undefined
  } | undefined
}>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 流式请求/响应
// ═══════════════════════════════════════════════════════════════

/** 流式请求输入（一次 AI turn 的完整输入） */
export type AiHostStreamTurnInput = Readonly<{
  sessionId: string
  scope: AiHostBusinessScope
  turn: AiHostTurnMeta
  systemPrompt: string
  tools: readonly AiHostTransportToolSpec[]
  messages: readonly AiHostTransportMessage[]
  signal?: AbortSignal | undefined
  onSseEvent?: ((event: AiHostSseEvent) => void) | undefined
  onDelta?: ((delta: string) => void) | undefined
  onReasoning?: ((reasoning: string) => void) | undefined
  onUsage?: ((usage: Record<string, unknown>) => void) | undefined
}>

/** 流式请求结果 */
export type AiHostStreamTurnResult = Readonly<{
  text: string
  reasoning?: string | undefined
  toolCalls: readonly AiHostTransportToolCall[]
}>

/** 追加消息请求输入 */
export type AiHostAppendMessagesInput = Readonly<{
  sessionId: string
  scope: AiHostBusinessScope
  turn: AiHostTurnMeta
  messages: readonly AiHostTransportMessage[]
}>

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 传输层抽象
// ═══════════════════════════════════════════════════════════════

/**
 * 传输层抽象类。
 *
 * 定义了两个核心操作：
 *   streamTurn    — 发送流式请求，返回 AI 文本 + 工具调用
 *   appendMessages — 追加消息到服务端会话（工具调用完成后）
 *
 * 当前唯一实现：AiHostFetchTransport（基于 fetch + SSE）
 */
export abstract class AiHostTransport {
  public abstract streamTurn(input: AiHostStreamTurnInput): Promise<AiHostStreamTurnResult>
  public abstract appendMessages(input: AiHostAppendMessagesInput): Promise<void>
}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · Fetch Transport 配置
// ═══════════════════════════════════════════════════════════════

/** 请求头提供器（支持同步/异步） */
export type AiHostHeadersProvider = () => HeadersInit | Promise<HeadersInit>

/** fetch 函数签名（兼容原生 fetch 和自定义实现） */
export type AiHostFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/** Fetch Transport 构造选项 */
export type AiHostFetchTransportOptions = Readonly<{
  baseUrl?: string | undefined
  fetch?: AiHostFetch | undefined
  getHeaders?: AiHostHeadersProvider | undefined
  protocolVersion?: number | undefined
}>

// ═══════════════════════════════════════════════════════════════
// 第 5 节 · 附件上传
// ═══════════════════════════════════════════════════════════════

/** 上传后的附件元数据 */
export type AiHostUploadedAttachment = Readonly<{
  fileId: string
  name: string
  size: number
  mimeType: string
}>
