/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  AI HOST · Fetch + SSE 传输实现                                              │
 * │  Fetch-based Transport with SSE Stream Reading                               │
 * │                                                                              │
 * │  本模块是 AiHostTransport 的 HTTP 实现，基于标准 fetch API + SSE（Server-Sent  │
 * │  Events）协议与 AI 后端通信。                                                 │
 * │                                                                              │
 * │  两个核心端点：                                                               │
 * │    POST /sessions/{sessionId}/turn/stream   — 流式 AI 推理（SSE 响应）        │
 * │    POST /sessions/{sessionId}/turn/append   — 追加消息到服务端会话            │
 * │                                                                              │
 * │  请求体公共字段（protocolVersion）：                                          │
 * │    · protocolVersion — 协议版本号                                             │
 * │    · scope           — 运行时上下文（moduleId + moduleInstanceId + instanceId）│
 * │    · turn            — 轮次标识（turnId）                                     │
 * │                                                                              │
 * │  streamTurn 额外字段：                                                        │
 * │    · systemPrompt — 系统提示词                                                │
 * │    · tools        — 工具规约（transport 格式）                                │
 * │    · mode         — 固定 "function"                                          │
 * │    · messages     — 当前轮次消息列表                                          │
 * │                                                                              │
 * │  调用方：tool-loop-runner.ts（streamTurn + appendMessages）                   │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import { toAiHostRuntimeScope } from '../business/business-scope'
import {
  assertOkResponse,
  DEFAULT_PROTOCOL_VERSION,
  normalizeBaseUrl,
  resolveFetch,
} from './http-utils'
import {
  readAppendMessagesEnvelope,
  requireSseResponseBody,
  toTransportTurn,
} from './fetch-response-envelope'
import { readAiHostSseStream } from './sse-stream-reader'
import {
  AiHostTransport,
  type AiHostAppendMessagesInput,
  type AiHostFetch,
  type AiHostFetchTransportOptions,
  type AiHostHeadersProvider,
  type AiHostStreamTurnInput,
  type AiHostStreamTurnResult,
} from './transport-types'

/* -------------------------------------------------------------------------------
 * 一、Fetch Transport 实现
 * ----------------------------------------------------------------------------- */

export class AiHostFetchTransport extends AiHostTransport {
  private readonly baseUrl: string
  private readonly fetchClient: AiHostFetch
  private readonly getHeaders: AiHostHeadersProvider
  private readonly protocolVersion: number

  public constructor(options: AiHostFetchTransportOptions = {}) {
    super()
    this.baseUrl = normalizeBaseUrl(options.baseUrl)
    this.fetchClient = resolveFetch(options.fetch)
    this.getHeaders = options.getHeaders ?? (() => ({}))
    this.protocolVersion = options.protocolVersion ?? DEFAULT_PROTOCOL_VERSION
  }

  /* ── 流式推理 ────────────────────────────────────────────── */

  /**
   * 发送流式 AI 推理请求。
   *
   * 流程：
   *   1. POST → /sessions/{sessionId}/turn/stream
   *   2. 校验 HTTP 状态（assertOkResponse）
   *   3. 提取 response.body（requireSseResponseBody）
   *   4. 读取 SSE 流（readAiHostSseStream）→ 解析 delta / reasoning / usage / result / toolCalls
   *   5. 返回 AiHostStreamTurnResult { text, reasoning, toolCalls }
   */
  public async streamTurn(input: AiHostStreamTurnInput): Promise<AiHostStreamTurnResult> {
    const response = await this.fetchClient(
      `${this.baseUrl}/sessions/${encodeURIComponent(input.sessionId)}/turn/stream`,
      {
        method: 'POST',
        headers: await this.jsonHeaders(),
        body: JSON.stringify({
          protocolVersion: this.protocolVersion,
          systemPrompt: input.systemPrompt,
          tools: input.tools,
          mode: 'function',
          scope: toAiHostRuntimeScope(input.scope),
          turn: toTransportTurn(input.turn),
          messages: input.messages,
        }),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      },
    )

    await assertOkResponse(response, 'AI stream turn')
    return readAiHostSseStream(input, requireSseResponseBody(response, 'AI stream turn'))
  }

  /* ── 追加消息 ────────────────────────────────────────────── */

  /**
   * 追加消息到服务端会话（工具调用完成后同步）。
   *
   * 流程：
   *   1. POST → /sessions/{sessionId}/turn/append
   *   2. 校验 HTTP 状态
   *   3. 读取响应信封 → 校验 sessionId + turnId 匹配
   */
  public async appendMessages(input: AiHostAppendMessagesInput): Promise<void> {
    const response = await this.fetchClient(
      `${this.baseUrl}/sessions/${encodeURIComponent(input.sessionId)}/turn/append`,
      {
        method: 'POST',
        headers: await this.jsonHeaders(),
        body: JSON.stringify({
          protocolVersion: this.protocolVersion,
          scope: toAiHostRuntimeScope(input.scope),
          turn: toTransportTurn(input.turn),
          messages: input.messages,
        }),
      },
    )

    await assertOkResponse(response, 'AI append messages')
    await readAppendMessagesEnvelope(response, input)
  }

  /* ── 内部辅助 ────────────────────────────────────────────── */

  /** 构造 JSON 请求头：合并自定义 headers + Content-Type: application/json */
  private async jsonHeaders(): Promise<Headers> {
    const headers = new Headers(await Promise.resolve(this.getHeaders()))
    headers.set('Content-Type', 'application/json')
    return headers
  }
}

/* -------------------------------------------------------------------------------
 * 二、SSE 解析器重导出
 * -------------------------------------------------------------------------------
 * parseAiHostSseBlocks 从 sse-parser.ts 导入并重导出，
 * 便于消费方统一从 transport 层入口获取 SSE 解析能力。
 * ----------------------------------------------------------------------------- */

export { parseAiHostSseBlocks } from './sse-parser'
