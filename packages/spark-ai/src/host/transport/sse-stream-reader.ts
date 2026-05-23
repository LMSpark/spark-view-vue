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

import { createAiHostStreamKey, createAiHostTurnKey } from '../business/business-scope'
import type { AiHostBusinessScope } from '../business/business-types'
import type { AiHostSseEvent } from '../chat/chat-types'
import {
  isRecord,
  isApiEnvelope,
  readApiEnvelopeContext,
  readApiEnvelopeEvent,
  readApiEnvelopeRequestId,
  tryParseJson,
  unwrapApiEnvelope,
  type ApiEnvelopeContext,
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

type MutableTransportToolCall = {
  id?: string | undefined
  type?: string | undefined
  function?: {
    name?: string | undefined
    arguments?: string | undefined
  } | undefined
}

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
// PAGE_DESIGN_AI_TRACE[host-sse-reader]: AI stream POST 返回后统一在这里按 SSE frame 聚合 delta/result/toolCalls；pageDesign 业务工具不应下沉到这个通用 reader。
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
 *   - toolCalls 优先从 result 事件提取；若后端直接透传 OpenAI SSE chunk，则从 delta.tool_calls 增量拼装
 * ----------------------------------------------------------------------------- */

class AiHostSseTurnState {
  /** 最终文本（优先取 result.text，回退到 delta 累积） */
  private finalText = ''
  /** 推理过程文本 */
  private finalReasoning: string | undefined
  /** 工具调用列表（优先从 result 事件提取） */
  private finalToolCalls: readonly AiHostTransportToolCall[] = []
  /** 兼容后端不再识别 function 时透传的 OpenAI tool_calls 增量。 */
  private readonly toolCallDeltas = new Map<number, MutableTransportToolCall>()
  /** 协议兼容警告每条流只报一次，避免诊断事件刷屏。 */
  private compatibilityWarningSent = false

  public constructor(private readonly input: AiHostStreamTurnInput) {}

  /** 处理单个 SSE 事件 */
  public handle(parsedEvent: AiHostParsedSseEvent): void {
    // 解析 JSON payload 并解包 API 信封
    const rawPayload = tryParseJson(parsedEvent.data)
    const normalized = normalizeProtocolV4Envelope(rawPayload)
    const payloadEnvelope = normalized.payload
    if (normalized.warning !== undefined) {
      this.emitProtocolWarning(parsedEvent, {
        message: normalized.warning,
        event: parsedEvent.event,
        protocol: 'v4',
      })
    }
    const isV4Envelope = hasProtocolV4Marker(payloadEnvelope)
    if (isV4Envelope) {
      this.validateProtocolV4Envelope(parsedEvent, payloadEnvelope)
    }
    const envelopeContext = readApiEnvelopeContext(payloadEnvelope)
    if (!isV4Envelope) this.emitCompatibilityWarning(parsedEvent, payloadEnvelope)
    let payload: unknown
    try {
      payload = unwrapApiEnvelope(payloadEnvelope)
    } catch (error) {
      this.input.onSseEvent?.(createSseEvent(parsedEvent, payloadEnvelope, this.input.scope, this.input.turn.turnId))
      if (parsedEvent.event === 'error') {
        throw new Error(formatSseErrorPayload(payloadEnvelope, error))
      }
      throw error
    }

    // 通知前端原始 SSE 事件（诊断/调试用）
    this.input.onSseEvent?.(createSseEvent(parsedEvent, payload, this.input.scope, this.input.turn.turnId))

    if (parsedEvent.event === 'error') {
      throw new Error(formatSseErrorPayload(payload))
    }
    if (this.applyOpenAiChoiceChunk(payload)) {
      return
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
      this.applyResult(payload, envelopeContext)
      return
    }
    if ((parsedEvent.event === 'toolCalls' || parsedEvent.event === 'tool_calls') && isRecord(payload)) {
      this.applyToolCallsPayload(payload)
    }
  }

  /** 输出聚合后的最终结果 */
  public result(): AiHostStreamTurnResult {
    return {
      text: this.finalText,
      ...(this.finalReasoning === undefined ? {} : { reasoning: this.finalReasoning }),
      toolCalls: this.finalToolCalls.length > 0 ? this.finalToolCalls : this.materializeToolCallDeltas(),
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

  private applyResult(payload: Readonly<Record<string, unknown>>, context: ApiEnvelopeContext | undefined): void {
    // 校验 sessionId 和 turnId 一致性（防止跨会话数据污染）
    const responseSessionId = context?.session?.sessionId
      ?? (typeof payload['sessionId'] === 'string' ? payload['sessionId'] : '')
    const responseTurnId = context?.turn?.turnId
      ?? (typeof payload['turnId'] === 'string' ? payload['turnId'] : '')
    const responseStreamKey = context?.stream?.streamKey
      ?? (typeof payload['streamKey'] === 'string' ? payload['streamKey'] : '')
    const expectedStreamKey = createAiHostStreamKey(this.input.scope, this.input.turn.turnId, 'llm-stream')
    if (responseSessionId !== '' && responseSessionId !== this.input.sessionId) {
      throw new Error(`AI stream result sessionId mismatch: expected=${this.input.sessionId}, actual=${responseSessionId}`)
    }
    if (responseTurnId !== '' && responseTurnId !== this.input.turn.turnId) {
      throw new Error(`AI stream result turnId mismatch: expected=${this.input.turn.turnId}, actual=${responseTurnId}`)
    }
    if (responseStreamKey !== '' && responseStreamKey !== expectedStreamKey) {
      throw new Error('AI stream result streamKey mismatch')
    }
    // result 中的 text/reasoning 覆盖 delta 累积值
    if (typeof payload['text'] === 'string') this.finalText = payload['text']
    if (typeof payload['reasoning'] === 'string') this.finalReasoning = payload['reasoning']
    this.applyToolCallsPayload(payload)
  }

  private applyToolCallsPayload(payload: Readonly<Record<string, unknown>>): void {
    const toolCalls = readToolCallsFromPayload(payload)
    if (toolCalls.length > 0) {
      this.finalToolCalls = toolCalls
    }
  }

  private applyOpenAiChoiceChunk(payload: unknown): boolean {
    const choices = isRecord(payload) && Array.isArray(payload['choices']) ? payload['choices'] : []
    if (choices.length === 0) return false
    for (const choice of choices) {
      if (!isRecord(choice)) continue
      const delta = isRecord(choice['delta']) ? choice['delta'] : null
      const message = isRecord(choice['message']) ? choice['message'] : null
      const source = delta ?? message
      if (source === null) continue
      if (typeof source['content'] === 'string' && source['content'].length > 0) {
        this.finalText += source['content']
        this.input.onDelta?.(source['content'])
      }
      if (typeof source['reasoning_content'] === 'string' && source['reasoning_content'].length > 0) {
        this.finalReasoning = `${this.finalReasoning ?? ''}${source['reasoning_content']}`
        this.input.onReasoning?.(source['reasoning_content'])
      }
      if (Array.isArray(source['tool_calls'])) {
        this.appendToolCallDeltas(source['tool_calls'])
      }
      if (Array.isArray(source['toolCalls'])) {
        this.appendToolCallDeltas(source['toolCalls'])
      }
    }
    return true
  }

  private appendToolCallDeltas(values: readonly unknown[]): void {
    values.forEach((value, fallbackIndex) => {
      if (!isRecord(value)) return
      const index = typeof value['index'] === 'number' && Number.isInteger(value['index'])
        ? value['index']
        : fallbackIndex
      const current = this.toolCallDeltas.get(index) ?? {
        type: 'function',
        function: {},
      }
      if (typeof value['id'] === 'string' && value['id'].length > 0) current.id = value['id']
      if (typeof value['type'] === 'string' && value['type'].length > 0) current.type = value['type']
      if (isRecord(value['function'])) {
        const fn = value['function']
        current.function ??= {}
        if (typeof fn['name'] === 'string' && fn['name'].length > 0) current.function.name = fn['name']
        if (typeof fn['arguments'] === 'string') {
          current.function.arguments = `${current.function.arguments ?? ''}${fn['arguments']}`
        } else if (fn['arguments'] !== undefined) {
          current.function.arguments = JSON.stringify(fn['arguments'])
        }
      }
      this.toolCallDeltas.set(index, current)
    })
  }

  private materializeToolCallDeltas(): readonly AiHostTransportToolCall[] {
    return [...this.toolCallDeltas.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, call]) => normalizeTransportToolCall(call))
      .filter((call): call is AiHostTransportToolCall => call !== null)
  }

  private emitCompatibilityWarning(parsedEvent: AiHostParsedSseEvent, rawPayload: unknown): void {
    if (this.compatibilityWarningSent || hasProtocolV4Marker(rawPayload)) return
    const protocol = isApiEnvelope(rawPayload)
      ? `v${String(rawPayload.protocolVersion ?? 3)}`
      : 'plain'
    this.emitProtocolWarning(parsedEvent, {
      message: 'Received legacy AI SSE payload; parsed through compatibility path.',
      event: parsedEvent.event,
      protocol,
    })
  }

  private emitProtocolWarning(parsedEvent: AiHostParsedSseEvent, warning: Readonly<Record<string, unknown>>): void {
    if (this.compatibilityWarningSent) return
    this.compatibilityWarningSent = true
    this.input.onSseEvent?.(createSseEvent(
      { event: 'protocol-warning', data: parsedEvent.data },
      warning,
      this.input.scope,
      this.input.turn.turnId,
    ))
  }

  // PAGE_DESIGN_AI_TRACE[host-sse-v4-envelope]: V4 SSE wire 信封校验真源；只校验协议归属和 turn/session/stream，不解释 pageDesign 业务载荷。
  private validateProtocolV4Envelope(parsedEvent: AiHostParsedSseEvent, rawPayload: unknown): void {
    const malformedReason = readMalformedV4EnvelopeReason(rawPayload)
    if (malformedReason !== '') {
      throw new Error(`AI SSE v4 envelope is malformed: event=${parsedEvent.event}, ${malformedReason}`)
    }
    if (!isApiEnvelope(rawPayload)) throw new Error(`AI SSE v4 envelope is malformed: event=${parsedEvent.event}`)
    const envelopeEvent = readApiEnvelopeEvent(rawPayload)
    if (envelopeEvent?.transport !== 'sse') {
      throw new Error(`AI SSE v4 envelope transport mismatch: event=${parsedEvent.event}`)
    }
    if (envelopeEvent.name !== parsedEvent.event) {
      throw new Error(`AI SSE v4 envelope event name mismatch: frame=${parsedEvent.event}, envelope=${String(envelopeEvent.name ?? '')}`)
    }
    const context = readApiEnvelopeContext(rawPayload)
    if (context?.requestId === undefined || context.requestId.trim().length === 0) {
      throw new Error(`AI SSE v4 envelope missing requestId: event=${parsedEvent.event}`)
    }
    const expectedStreamKey = createAiHostStreamKey(this.input.scope, this.input.turn.turnId, 'llm-stream')
    if (context.session?.sessionId !== this.input.sessionId) {
      throw new Error(`AI SSE v4 envelope sessionId mismatch: expected=${this.input.sessionId}, actual=${String(context.session?.sessionId ?? '')}`)
    }
    if (context.turn?.turnId !== this.input.turn.turnId) {
      throw new Error(`AI SSE v4 envelope turnId mismatch: expected=${this.input.turn.turnId}, actual=${String(context.turn?.turnId ?? '')}`)
    }
    if (context.stream?.streamKey !== expectedStreamKey) {
      throw new Error(`AI SSE v4 envelope streamKey mismatch: expected=${expectedStreamKey}, actual=${String(context.stream?.streamKey ?? '')}`)
    }
  }
}

function hasProtocolV4Marker(value: unknown): boolean {
  return isRecord(value) && value['protocolVersion'] === 4
}

function normalizeProtocolV4Envelope(value: unknown): Readonly<{ payload: unknown, warning?: string | undefined }> {
  return { payload: value }
}

function readMalformedV4EnvelopeReason(value: unknown): string {
  if (!isRecord(value)) return 'payload is not an object'
  const missing: string[] = []
  if (typeof value['ok'] !== 'boolean') missing.push('ok')
  if (value['ok'] === true && !Object.prototype.hasOwnProperty.call(value, 'data')) missing.push('data')
  if (value['ok'] !== true && !Object.prototype.hasOwnProperty.call(value, 'error')) missing.push('error')
  const context = value['context']
  if (!isRecord(context)) {
    missing.push('context')
  } else if (typeof context['requestId'] !== 'string' || context['requestId'].trim().length === 0) {
    missing.push('context.requestId')
  }
  return missing.length === 0 ? '' : `missing ${missing.join(', ')}`
}

function formatSseErrorPayload(payload: unknown, fallback?: unknown): string {
  const fallbackMessage = fallback instanceof Error ? fallback.message : 'AI stream failed'
  if (typeof payload === 'string') return payload
  if (!isRecord(payload)) return fallbackMessage

  const error = isRecord(payload['error']) ? payload['error'] : null
  const data = isRecord(payload['data']) ? payload['data'] : null
  const context = readApiEnvelopeContext(payload)
  const requestId = readApiEnvelopeRequestId(payload)
  const message = typeof error?.['message'] === 'string' && error['message'].trim().length > 0
    ? error['message']
    : fallbackMessage
  const code = typeof error?.['code'] === 'string' && error['code'].trim().length > 0
    ? error['code']
    : ''
  const details = [
    code.length > 0 ? `code=${code}` : '',
    requestId !== undefined ? `requestId=${requestId}` : '',
    context?.session?.sessionId !== undefined ? `sessionId=${context.session.sessionId}` : (
      data !== null && typeof data['sessionId'] === 'string' ? `sessionId=${data['sessionId']}` : ''
    ),
    context?.turn?.turnId !== undefined ? `turnId=${context.turn.turnId}` : (
      data !== null && typeof data['turnId'] === 'string' ? `turnId=${data['turnId']}` : ''
    ),
    context?.stream?.streamKey !== undefined ? `streamKey=${context.stream.streamKey}` : (
      data !== null && typeof data['streamKey'] === 'string' ? `streamKey=${data['streamKey']}` : ''
    ),
  ].filter((part) => part.length > 0)
  return details.length === 0 ? message : `${message} (${details.join(', ')})`
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
    turnKey: createAiHostTurnKey(scope, turnId),
    streamKey: createAiHostStreamKey(scope, turnId, 'llm-stream'),
    scope: {
      businessRegistrationId: scope.businessRegistrationId,
      businessInstanceId: scope.businessInstanceId,
      eventModuleId: 'llm',
      turnId,
    },
  }
}

// PAGE_DESIGN_AI_TRACE[host-sse-tool-call-payload]: 从 V4 result / legacy payload / OpenAI choices 中提取 toolCalls 的兼容边界；真正执行工具在 tool-loop。
function readToolCallsFromPayload(payload: Readonly<Record<string, unknown>>): readonly AiHostTransportToolCall[] {
  return [
    readToolCalls(payload['toolCalls']),
    readToolCalls(payload['tool_calls']),
    ...(isRecord(payload['message']) ? [
      readToolCalls(payload['message']['toolCalls']),
      readToolCalls(payload['message']['tool_calls']),
    ] : []),
    ...readToolCallsFromChoices(payload['choices']),
  ].find((items) => items.length > 0) ?? []
}

function readToolCallsFromChoices(value: unknown): ReadonlyArray<readonly AiHostTransportToolCall[]> {
  if (!Array.isArray(value)) return []
  return value.flatMap((choice) => {
    if (!isRecord(choice)) return []
    const message = isRecord(choice['message']) ? choice['message'] : null
    const delta = isRecord(choice['delta']) ? choice['delta'] : null
    return [
      ...(message === null ? [] : [
        readToolCalls(message['toolCalls']),
        readToolCalls(message['tool_calls']),
      ]),
      ...(delta === null ? [] : [
        readToolCalls(delta['toolCalls']),
        readToolCalls(delta['tool_calls']),
      ]),
    ]
  })
}

/** 从 result payload 中安全提取并归一化 toolCalls 数组 */
function readToolCalls(value: unknown): readonly AiHostTransportToolCall[] {
  return Array.isArray(value)
    ? value.map(normalizeTransportToolCall).filter((call): call is AiHostTransportToolCall => call !== null)
    : []
}

function normalizeTransportToolCall(value: unknown): AiHostTransportToolCall | null {
  if (!isRecord(value)) return null
  const fn = isRecord(value['function']) ? value['function'] : null
  if (fn === null) return null
  const functionName = typeof fn['name'] === 'string' ? fn['name'] : undefined
  if (functionName === undefined || functionName.trim().length === 0) return null
  const rawArguments = fn['arguments']
  const args = typeof rawArguments === 'string'
    ? rawArguments
    : (rawArguments === undefined ? undefined : JSON.stringify(rawArguments))
  return {
    ...(typeof value['id'] === 'string' ? { id: value['id'] } : {}),
    type: typeof value['type'] === 'string' ? value['type'] : 'function',
    function: {
      name: functionName,
      ...(args === undefined ? {} : { arguments: args }),
    },
  }
}
