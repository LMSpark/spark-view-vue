/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  AI HOST · SSE 流读取器                                                       │
 * │  SSE Stream Reader                                                            │
 * │                                                                              │
 * │  本模块负责读取 HTTP Response 的 SSE 字节流，逐事件解析后驱动状态机。           │
 * │                                                                              │
 * │  处理的事件类型：                                                             │
 * │    · delta     — LLM 文本增量（逐 token 追加）                                │
 * │    · reasoning — 推理过程文本增量                                              │
 * │    · usage     — token 用量报告                                               │
 * │    · result    — 最终结果（含 text、reasoning、toolCalls）                     │
 * │    · error     — 服务端错误（直接抛异常）                                      │
 * │                                                                              │
 * │  流结束后的收敛策略：                                                         │
 * │    result 事件可能出现在 delta 事件之前（服务端先发送结果再发送增量），          │
 * │    因此 finalText 以 result 中的 text 为准（若存在），否则回退到累积的 delta。   │
 * │                                                                              │
 * │  调用方：fetch-transport.ts（streamTurn 方法内）                               │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import { createAiHostStreamKey } from '../business/business-scope'
import type { AiHostBusinessScope } from '../business/business-types'
import type { AiHostSseEvent } from '../chat/chat-types'
import {
  isRecord,
  tryParseJson,
  unwrapApiEnvelope,
} from './http-utils'
import {
  parseAiHostFinalSseBlock,
  parseAiHostSseBlocks,
  type AiHostParsedSseEvent,
} from './sse-parser'
import type {
  AiHostStreamTurnInput,
  AiHostStreamTurnResult,
  AiHostTransportToolCall,
} from './transport-types'

/* -------------------------------------------------------------------------------
 * 一、流读取入口
 * ----------------------------------------------------------------------------- */

/**
 * 读取 AI 后端的 SSE 流响应。
 *
 * 流程：
 *   1. 创建 AiHostSseTurnState 状态机
 *   2. 逐 chunk 读取 ReadableStream
 *   3. 每批 chunk 通过 parseAiHostSseBlocks 分割为完整事件块
 *   4. 每个事件块驱动 state.handle(event)
 *   5. 流结束后用 parseAiHostFinalSseBlock 处理残留数据
 *   6. 返回 state.result()（聚合后的最终结果）
 */
export async function readAiHostSseStream(
  input: AiHostStreamTurnInput,
  body: ReadableStream<Uint8Array>,
): Promise<AiHostStreamTurnResult> {
  const state = new AiHostSseTurnState(input)
  const decoder = new TextDecoder()
  let buffer = ''

  // 流式读取：逐 chunk 追加到 buffer，提取完整事件块
  await readStreamBody(body, (chunk) => {
    buffer += decoder.decode(chunk, { stream: true })
    const parsed = parseAiHostSseBlocks(buffer)
    buffer = parsed.rest
    for (const event of parsed.events) state.handle(event)
  })

  // 流结束：处理最后残留的 buffer
  buffer += decoder.decode()
  for (const event of parseAiHostFinalSseBlock(buffer)) state.handle(event)

  return state.result()
}

/* -------------------------------------------------------------------------------
 * 二、SSE Turn 状态机
 * -------------------------------------------------------------------------------
 * 聚合一个 turn 内的所有 SSE 事件，在 result() 调用时输出最终结果。
 *
 * 收敛逻辑：
 *   - 若收到 result 事件（含 text 字段）→ finalText 以 result.text 为准
 *   - 否则 finalText = 所有 delta 事件的拼接
 *   - reasoning 同逻辑
 *   - toolCalls 仅从 result 事件中提取
 * ----------------------------------------------------------------------------- */

class AiHostSseTurnState {
  /** 最终文本（优先取 result.text，回退到 delta 累积） */
  private finalText = ''
  /** 推理过程文本 */
  private finalReasoning: string | undefined
  /** 工具调用列表（仅从 result 事件提取） */
  private finalToolCalls: readonly AiHostTransportToolCall[] = []

  public constructor(private readonly input: AiHostStreamTurnInput) {}

  /** 处理单个 SSE 事件 */
  public handle(parsedEvent: AiHostParsedSseEvent): void {
    // 解析 JSON payload 并解包 API 信封
    const rawPayload = tryParseJson(parsedEvent.data)
    const payload = unwrapApiEnvelope(rawPayload)

    // 通知前端原始 SSE 事件（诊断/调试用）
    this.input.onSseEvent?.(createSseEvent(parsedEvent, payload, this.input.scope, this.input.turn.turnId))

    if (parsedEvent.event === 'error') {
      throw new Error(typeof payload === 'string' ? payload : 'AI stream failed')
    }
    if (parsedEvent.event === 'delta') {
      this.appendDelta(payload)
      return
    }
    if (parsedEvent.event === 'reasoning') {
      this.appendReasoning(payload)
      return
    }
    if (parsedEvent.event === 'usage' && isRecord(payload) && isRecord(payload['usage'])) {
      this.input.onUsage?.(payload['usage'])
      return
    }
    if (parsedEvent.event === 'result' && isRecord(payload)) {
      this.applyResult(payload)
    }
  }

  /** 输出聚合后的最终结果 */
  public result(): AiHostStreamTurnResult {
    return {
      text: this.finalText,
      ...(this.finalReasoning === undefined ? {} : { reasoning: this.finalReasoning }),
      toolCalls: this.finalToolCalls,
    }
  }

  /* ── delta 事件：累积文本增量 ─────────────────────────── */

  private appendDelta(payload: unknown): void {
    const delta = isRecord(payload) && typeof payload['delta'] === 'string'
      ? payload['delta']
      : (typeof payload === 'string' ? payload : '')
    if (delta === '') return
    this.finalText += delta
    this.input.onDelta?.(delta)
  }

  /* ── reasoning 事件：累积推理增量 ──────────────────────── */

  private appendReasoning(payload: unknown): void {
    const reasoning = isRecord(payload) && typeof payload['reasoning'] === 'string'
      ? payload['reasoning']
      : (typeof payload === 'string' ? payload : '')
    if (reasoning === '') return
    this.finalReasoning = `${this.finalReasoning ?? ''}${reasoning}`
    this.input.onReasoning?.(reasoning)
  }

  /* ── result 事件：覆盖最终值 + 提取 toolCalls ──────────── */

  private applyResult(payload: Readonly<Record<string, unknown>>): void {
    // 校验 sessionId 和 turnId 一致性（防止跨会话数据污染）
    const responseSessionId = typeof payload['sessionId'] === 'string' ? payload['sessionId'] : ''
    const responseTurnId = typeof payload['turnId'] === 'string' ? payload['turnId'] : ''
    if (responseSessionId !== this.input.sessionId) {
      throw new Error('AI stream result sessionId mismatch')
    }
    if (responseTurnId !== this.input.turn.turnId) {
      throw new Error('AI stream result turnId mismatch')
    }
    // result 中的 text/reasoning 覆盖 delta 累积值
    if (typeof payload['text'] === 'string') this.finalText = payload['text']
    if (typeof payload['reasoning'] === 'string') this.finalReasoning = payload['reasoning']
    this.finalToolCalls = readToolCalls(payload['toolCalls'])
  }
}

/* -------------------------------------------------------------------------------
 * 三、内部辅助函数
 * ----------------------------------------------------------------------------- */

/** 逐块读取 ReadableStream，每块回调 onChunk */
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

/** 构造 SSE 事件对象（供前端路由） */
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

/** 类型守卫：校验 transport tool call 的 function 子对象 */
function isTransportToolFunction(value: unknown): value is AiHostTransportToolCall['function'] {
  return value === undefined || (isRecord(value)
    && (value['name'] === undefined || typeof value['name'] === 'string')
    && (value['arguments'] === undefined || typeof value['arguments'] === 'string'))
}

/** 类型守卫：校验 transport tool call */
function isTransportToolCall(value: unknown): value is AiHostTransportToolCall {
  return isRecord(value)
    && (value['id'] === undefined || typeof value['id'] === 'string')
    && (value['type'] === undefined || typeof value['type'] === 'string')
    && isTransportToolFunction(value['function'])
}

/** 从 result payload 中安全提取 toolCalls 数组 */
function readToolCalls(value: unknown): readonly AiHostTransportToolCall[] {
  return Array.isArray(value) ? value.filter(isTransportToolCall) : []
}
