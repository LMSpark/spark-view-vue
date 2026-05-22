/**
 * ═══════════════════════════════════════════════════════════════
 * host/transport/fetch-transport.ts — Fetch + SSE 传输实现
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】AiHostTransport 的唯一实现。基于 fetch API 发送请求，
 *   通过 SSE 流式接收 AI 响应（文本增量 + 工具调用）。
 *
 * 【数据流】
 *   1. streamTurn(input) → POST /sessions/{sessionId}/turn/stream
 *   2. 服务端返回 SSE 流 → readStreamBody 逐块读取
 *   3. parseAiHostSseBlocks 解析事件 → handle 分发
 *      - delta 事件 → 累积到 finalText，回调 onDelta
 *      - reasoning 事件 → 累积到 finalReasoning，回调 onReasoning
 *      - usage 事件 → 回调 onUsage
 *      - result 事件 → 提取最终文本 + toolCalls
 *      - error 事件 → 抛出异常
 *   4. 流结束后 → parseAiHostFinalSseBlock 处理残留
 *   5. 返回 AiHostStreamTurnResult { text, reasoning?, toolCalls }
 *
 *   6. appendMessages(input) → POST /sessions/{sessionId}/turn/append
 *      → 将工具调用结果追加到服务端会话历史
 *
 * 【消费方】Host 初始化代码（传入 AiHostOptions.transport）
 * ═══════════════════════════════════════════════════════════════
 */

import { createAiHostStreamKey, toAiHostRuntimeScope } from '../business/business-scope'
import type { AiHostBusinessScope } from '../business/business-types'
import type { AiHostSseEvent } from '../chat/chat-types'
import {
  assertOkResponse,
  DEFAULT_PROTOCOL_VERSION,
  isRecord,
  normalizeBaseUrl,
  readResponseJson,
  resolveFetch,
  tryParseJson,
  unwrapApiEnvelope,
} from './http-utils'
import {
  parseAiHostFinalSseBlock,
  parseAiHostSseBlocks,
  type AiHostParsedSseEvent,
} from './sse-parser'
import {
  AiHostTransport,
  type AiHostAppendMessagesInput,
  type AiHostFetch,
  type AiHostFetchTransportOptions,
  type AiHostHeadersProvider,
  type AiHostStreamTurnInput,
  type AiHostStreamTurnResult,
  type AiHostTransportToolCall,
} from './transport-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 工具调用类型守卫
// ═══════════════════════════════════════════════════════════════

/** 校验 toolCall.function 字段形状 */
function isTransportToolFunction(value: unknown): value is AiHostTransportToolCall['function'] {
  return value === undefined || (isRecord(value)
    && (value['name'] === undefined || typeof value['name'] === 'string')
    && (value['arguments'] === undefined || typeof value['arguments'] === 'string'))
}

/** 校验 toolCall 整体形状 */
function isTransportToolCall(value: unknown): value is AiHostTransportToolCall {
  return isRecord(value)
    && (value['id'] === undefined || typeof value['id'] === 'string')
    && (value['type'] === undefined || typeof value['type'] === 'string')
    && isTransportToolFunction(value['function'])
}

/** 从未知值中筛选合法的 toolCall 数组 */
function readToolCalls(value: unknown): readonly AiHostTransportToolCall[] {
  return Array.isArray(value) ? value.filter(isTransportToolCall) : []
}

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 请求体构造
// ═══════════════════════════════════════════════════════════════

/** 构造 transport 层的 turn 参数 */
function toTransportTurn(input: AiHostStreamTurnInput['turn']): { turnId: string } {
  return { turnId: input.turnId }
}

/** 构造 SSE 事件对象 */
function createSseEvent(
  parsedEvent: AiHostParsedSseEvent,
  payload: unknown,
  scope: AiHostBusinessScope,
  turnId: string,
): AiHostSseEvent {
  return {
    type: parsedEvent.event,
    data: typeof payload === 'string' ? payload : JSON.stringify(payload),
    streamKey: createAiHostStreamKey(scope, 'llm', turnId),
    scope: {
      businessRegistrationId: scope.businessRegistrationId,
      businessInstanceId: scope.businessInstanceId,
      eventModuleId: 'llm',
      turnId,
    },
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 流式读取
// ═══════════════════════════════════════════════════════════════

/**
 * 逐块读取 ReadableStream body。
 * 每次读取到数据时回调 onChunk，流结束后返回。
 */
async function readStreamBody(
  body: ReadableStream<Uint8Array>,
  onChunk: (chunk: Uint8Array) => void,
): Promise<void> {
  const reader = body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      onChunk(value)
    }
  } finally {
    reader.releaseLock()
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · AiHostFetchTransport class
// ═══════════════════════════════════════════════════════════════

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

  // ── 流式请求 ──────────────────────────────────────────────

  /**
   * 发送流式请求。
   *
   * POST /sessions/{sessionId}/turn/stream
   * Body: { protocolVersion, systemPrompt, tools, mode, scope, turn, messages }
   * Response: SSE 流
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
    if (response.body === null) {
      throw new Error('AI stream turn failed: response body is null')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let finalText = ''
    let finalReasoning: string | undefined
    let finalToolCalls: readonly AiHostTransportToolCall[] = []

    // SSE 事件处理器
    const handle = (parsedEvent: AiHostParsedSseEvent): void => {
      const rawPayload = tryParseJson(parsedEvent.data)
      const payload = unwrapApiEnvelope(rawPayload)
      input.onSseEvent?.(createSseEvent(parsedEvent, payload, input.scope, input.turn.turnId))

      if (parsedEvent.event === 'error') {
        throw new Error(typeof payload === 'string' ? payload : 'AI stream failed')
      }

      // delta 事件：文本增量
      if (parsedEvent.event === 'delta') {
        const delta = isRecord(payload) && typeof payload['delta'] === 'string'
          ? payload['delta']
          : (typeof payload === 'string' ? payload : '')
        if (delta !== '') {
          finalText += delta
          input.onDelta?.(delta)
        }
        return
      }

      // reasoning 事件：推理过程增量
      if (parsedEvent.event === 'reasoning') {
        const reasoning = isRecord(payload) && typeof payload['reasoning'] === 'string'
          ? payload['reasoning']
          : (typeof payload === 'string' ? payload : '')
        if (reasoning !== '') {
          finalReasoning = `${finalReasoning ?? ''}${reasoning}`
          input.onReasoning?.(reasoning)
        }
        return
      }

      // usage 事件：token 用量
      if (parsedEvent.event === 'usage' && isRecord(payload) && isRecord(payload['usage'])) {
        input.onUsage?.(payload['usage'])
        return
      }

      // result 事件：最终结果（包含完整文本和工具调用）
      if (parsedEvent.event === 'result' && isRecord(payload)) {
        const responseSessionId = typeof payload['sessionId'] === 'string' ? payload['sessionId'] : ''
        const responseTurnId = typeof payload['turnId'] === 'string' ? payload['turnId'] : ''
        // 安全校验：sessionId 和 turnId 必须匹配
        if (responseSessionId !== input.sessionId) {
          throw new Error('AI stream result sessionId mismatch')
        }
        if (responseTurnId !== input.turn.turnId) {
          throw new Error('AI stream result turnId mismatch')
        }
        if (typeof payload['text'] === 'string') finalText = payload['text']
        if (typeof payload['reasoning'] === 'string') finalReasoning = payload['reasoning']
        finalToolCalls = readToolCalls(payload['toolCalls'])
      }
    }

    // 流式读取循环
    await readStreamBody(response.body, (chunk) => {
      buffer += decoder.decode(chunk, { stream: true })
      const parsed = parseAiHostSseBlocks(buffer)
      buffer = parsed.rest
      for (const event of parsed.events) handle(event)
    })
    // 流结束后处理残留
    buffer += decoder.decode()
    for (const event of parseAiHostFinalSseBlock(buffer)) handle(event)

    return {
      text: finalText,
      ...(finalReasoning === undefined ? {} : { reasoning: finalReasoning }),
      toolCalls: finalToolCalls,
    }
  }

  // ── 追加消息 ──────────────────────────────────────────────

  /**
   * 追加消息到服务端会话。
   *
   * POST /sessions/{sessionId}/turn/append
   * Body: { protocolVersion, scope, turn, messages }
   *
   * 在工具循环中，每轮 AI 响应 + 工具调用完成后调用此方法，
   * 将 assistant 消息和 tool 结果追加到服务端历史。
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
    const body = unwrapApiEnvelope(await readResponseJson(response))
    if (!isRecord(body)) {
      throw new Error('AI append response missing body')
    }
    if (body['sessionId'] !== input.sessionId) {
      throw new Error('AI append response sessionId mismatch')
    }
    if (body['turnId'] !== input.turn.turnId) {
      throw new Error('AI append response turnId mismatch')
    }
  }

  // ── 内部 ──────────────────────────────────────────────────

  /** 构造 JSON 请求头 */
  private async jsonHeaders(): Promise<Headers> {
    const headers = new Headers(await Promise.resolve(this.getHeaders()))
    headers.set('Content-Type', 'application/json')
    return headers
  }
}

/** 重新导出 SSE 解析器（供外部调试/测试使用） */
export { parseAiHostSseBlocks } from './sse-parser'
