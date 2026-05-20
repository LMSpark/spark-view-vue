/**
 * AI Host SSE/Fetch 传输层实现。
 *
 * 职责：通过 fetch API + SSE 流与 LLM 后端通信。
 * 不依赖 Vue/React/Angular，可在任何支持 fetch 的环境运行。
 *
 * 核心流程（streamTurn）：
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ 1. 构建请求体：protocolVersion + systemPrompt + tools + scope     │
 * │               + turn + messages                                  │
 * │ 2. POST /sessions/{id}/turn/stream → 获取 ReadableStream          │
 * │ 3. 读取流：chunk → TextDecoder → buffer → parseAiHostSseBlocks   │
 * │ 4. 解析 SSE blocks：按事件类型分发                                │
 * │    ├─ error   → 抛出异常，中断流                                 │
 * │    ├─ delta   → 累积文本 → 回调 onDelta                          │
 * │    ├─ reasoning → 累积推理 → 回调 onReasoning                    │
 * │    ├─ usage   → 回调 onUsage                                     │
 * │    └─ result  → 校验 sessionId/turnId → 提取最终结果              │
 * │ 5. 流结束后处理剩余 buffer → parseAiHostFinalSseBlock             │
 * │ 6. 返回 { text, reasoning?, toolCalls }                          │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * 核心流程（appendMessages）：
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ 1. POST /sessions/{id}/turn/append → 写入历史，不触发 LLM 回复    │
 * │ 2. 校验响应体：sessionId 和 turnId 一致性                         │
 * └──────────────────────────────────────────────────────────────────┘
 */

import type {
  AiHostAppendMessagesInput,
  AiHostBusinessScope,
  AiHostSseEvent,
  AiHostStreamTurnInput,
  AiHostStreamTurnResult,
  AiHostTransport,
  AiHostTransportToolCall,
} from './types'
import {
  createAiHostStreamKey,
  toAiHostRuntimeScope,
} from './scope'

const DEFAULT_PROTOCOL_VERSION = 3
const DEFAULT_BASE_URL = '/api/ai'

// ═══════════════════════════════════════════════════════
// 传输层类型定义
// ═══════════════════════════════════════════════════════

/** 请求头提供者函数，用于动态生成请求头（如注入 token） */
export interface AiHostHeadersProvider {
  (): HeadersInit | Promise<HeadersInit>
}

/** fetch 函数类型，支持传入自定义 fetch 实现 */
export interface AiHostFetch {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

/** 传输层初始化选项 */
export interface AiHostFetchTransportOptions {
  /** API 基础 URL，默认 '/api/ai' */
  readonly baseUrl?: string | undefined
  /** 自定义 fetch 实现，默认使用全局 fetch */
  readonly fetch?: AiHostFetch | undefined
  /** 动态请求头提供者，用于注入认证 token 等 */
  readonly getHeaders?: AiHostHeadersProvider | undefined
  /** 协议版本号，默认 3 */
  readonly protocolVersion?: number | undefined
}

/** 解析后的 SSE 事件，包含事件类型和数据字符串 */
export interface AiHostParsedSseEvent {
  /** 事件类型：delta / reasoning / usage / result / error 等 */
  readonly event: string
  /** 原始数据字符串（需要进一步 JSON 解析） */
  readonly data: string
}

/** 附件上传结果 */
export interface AiHostUploadedAttachment {
  /** 上传后的文件 ID */
  readonly fileId: string
  /** 文件名 */
  readonly name: string
  /** 文件大小（字节） */
  readonly size: number
  /** MIME 类型 */
  readonly mimeType: string
}

// ═══════════════════════════════════════════════════════
// 类型守卫
// ═══════════════════════════════════════════════════════

/** 检查值是否为普通对象（非 null、非数组） */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 尝试解析 JSON 字符串，失败时返回原始值 */
function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

/** 检查值是否为标准 API 响应信封 { ok, data, error, requestId } */
function isApiEnvelope(value: unknown): value is {
  ok: boolean
  data: unknown
  error: { code?: unknown; message?: unknown } | null
  requestId: string
} {
  return isRecord(value)
    && typeof value['ok'] === 'boolean'
    && Object.prototype.hasOwnProperty.call(value, 'data')
    && Object.prototype.hasOwnProperty.call(value, 'error')
    && typeof value['requestId'] === 'string'
}

/**
 * 解包 API 响应信封。
 * 如果是成功响应（ok=true）返回 data 字段，
 * 如果是失败响应（ok=false）抛出包含错误消息的异常。
 */
function unwrapApiEnvelope(value: unknown): unknown {
  if (!isApiEnvelope(value)) return value
  if (value.ok) return value.data
  const message = isRecord(value.error) && typeof value.error['message'] === 'string'
    ? value.error['message']
    : 'AI request failed'
  throw new Error(message)
}

/** 检查值是否为合法的 tool function 结构 */
function isTransportToolFunction(value: unknown): value is AiHostTransportToolCall['function'] {
  return value === undefined || (isRecord(value)
    && (value['name'] === undefined || typeof value['name'] === 'string')
    && (value['arguments'] === undefined || typeof value['arguments'] === 'string'))
}

/** 检查值是否为合法的 tool call 结构 */
function isTransportToolCall(value: unknown): value is AiHostTransportToolCall {
  return isRecord(value)
    && (value['id'] === undefined || typeof value['id'] === 'string')
    && (value['type'] === undefined || typeof value['type'] === 'string')
    && isTransportToolFunction(value['function'])
}

/** 从数组中过滤出合法的 tool call 对象 */
function readToolCalls(value: unknown): readonly AiHostTransportToolCall[] {
  return Array.isArray(value) ? value.filter(isTransportToolCall) : []
}

// ═══════════════════════════════════════════════════════
// SSE 解析
// ═══════════════════════════════════════════════════════

/**
 * 解析单个 SSE block。
 * 格式：event: eventName\ndata: payload\n\n
 * 忽略空行和注释行（以 : 开头）。
 */
function parseAiHostSseBlock(block: string): AiHostParsedSseEvent | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':')) continue
    const colonIndex = line.indexOf(':')
    const field = colonIndex < 0 ? line : line.slice(0, colonIndex)
    let value = colonIndex < 0 ? '' : line.slice(colonIndex + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value.trim()
    if (field === 'data') dataLines.push(value)
  }
  if (dataLines.length === 0) return null
  return { event, data: dataLines.join('\n') }
}

/**
 * 解析累积 buffer 中的多个 SSE blocks。
 * 按 \n\n 分割，最后一个片段作为 rest 返回（等待更多数据），
 * 其余片段全部解析为事件。
 */
export function parseAiHostSseBlocks(buffer: string): { events: readonly AiHostParsedSseEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const parts = normalized.split('\n\n')
  const rest = parts.pop() ?? ''
  return {
    events: parts.flatMap((block): AiHostParsedSseEvent[] => {
      const parsed = parseAiHostSseBlock(block)
      return parsed === null ? [] : [parsed]
    }),
    rest,
  }
}

/** 解析流结束时的剩余 buffer，返回最后一个事件（如果有） */
function parseAiHostFinalSseBlock(buffer: string): readonly AiHostParsedSseEvent[] {
  const normalized = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const parsed = normalized.trim() === '' ? null : parseAiHostSseBlock(normalized)
  return parsed === null ? [] : [parsed]
}

// ═══════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════

/** 获取 fetch 实现：优先使用传入的，否则使用全局 fetch */
function resolveFetch(fetchClient: AiHostFetch | undefined): AiHostFetch {
  if (fetchClient !== undefined) return fetchClient
  if (typeof fetch !== 'function') {
    throw new Error('AiHostFetchTransport requires a fetch implementation')
  }
  return fetch.bind(globalThis)
}

/** 规范化 baseUrl：移除末尾的斜杠 */
function normalizeBaseUrl(value: string | undefined): string {
  return (value ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
}

/** 将输入 turn 元信息转换为传输层 turn 对象（仅保留 turnId） */
function toTransportTurn(input: AiHostStreamTurnInput['turn']): { turnId: string } {
  return { turnId: input.turnId }
}

/** 构建 SSE 事件对象，包含事件类型、序列化数据和作用域信息 */
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

// ═══════════════════════════════════════════════════════
// 流读取辅助
// ═══════════════════════════════════════════════════════

/**
 * 读取 ReadableStream  body。
 * 逐块读取并调用 onChunk 回调，finally 中释放锁。
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

/** 读取响应 JSON，空响应体返回 null */
async function readResponseJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.trim() === '') return null
  return tryParseJson(text)
}

/** 校验响应状态，非 2xx 时抛出包含状态码和响应体的异常 */
async function assertOkResponse(response: Response, action: string): Promise<void> {
  if (response.ok) return
  const body = await response.text()
  throw new Error(`${action} failed: ${response.status} ${body}`)
}

// ═══════════════════════════════════════════════════════
// AiHostFetchTransport 实现
// ═══════════════════════════════════════════════════════

export class AiHostFetchTransport implements AiHostTransport {
  private readonly baseUrl: string
  private readonly fetchClient: AiHostFetch
  private readonly getHeaders: AiHostHeadersProvider
  private readonly protocolVersion: number

  /** 初始化传输层：解析 baseUrl / fetch / headers / protocolVersion */
  constructor(options: AiHostFetchTransportOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl)
    this.fetchClient = resolveFetch(options.fetch)
    this.getHeaders = options.getHeaders ?? (() => ({}))
    this.protocolVersion = options.protocolVersion ?? DEFAULT_PROTOCOL_VERSION
  }

  /** 构建 JSON 请求头，合并动态提供的请求头 */
  private async jsonHeaders(): Promise<Headers> {
    const headers = new Headers(await Promise.resolve(this.getHeaders()))
    headers.set('Content-Type', 'application/json')
    return headers
  }

  /**
   * SSE 流式请求 LLM。
   *
   * 流程：POST → 读取 ReadableStream → 解析 SSE blocks → 按事件分发 → 返回最终结果。
   *
   * 事件类型说明：
   * - delta: 增量文本片段，累积为最终回复
   * - reasoning: 推理文本片段，累积为推理过程
   * - usage: token 使用统计
   * - result: 最终结果，包含完整文本和工具调用列表
   * - error: 错误事件，中断流并抛出异常
   */
  async streamTurn(input: AiHostStreamTurnInput): Promise<AiHostStreamTurnResult> {
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

    // SSE 事件处理器：按事件类型分发
    const handle = (parsedEvent: AiHostParsedSseEvent): void => {
      const rawPayload = tryParseJson(parsedEvent.data)
      const payload = unwrapApiEnvelope(rawPayload)
      input.onSseEvent?.(createSseEvent(parsedEvent, payload, input.scope, input.turn.turnId))

      // error 事件 → 抛出异常中断
      if (parsedEvent.event === 'error') {
        throw new Error(typeof payload === 'string' ? payload : 'AI stream failed')
      }

      // delta 事件 → 累积文本 → 回调 onDelta
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

      // reasoning 事件 → 累积推理文本 → 回调 onReasoning
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

      // usage 事件 → 回调 onUsage
      if (parsedEvent.event === 'usage' && isRecord(payload) && isRecord(payload['usage'])) {
        input.onUsage?.(payload['usage'])
        return
      }

      // result 事件 → 校验 sessionId/turnId → 提取最终文本/推理/toolCalls
      if (parsedEvent.event === 'result' && isRecord(payload)) {
        const responseSessionId = typeof payload['sessionId'] === 'string' ? payload['sessionId'] : ''
        const responseTurnId = typeof payload['turnId'] === 'string' ? payload['turnId'] : ''
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

    // 读取流式响应体：累积 buffer → 解析 SSE → 处理事件
    await readStreamBody(response.body, (chunk) => {
      buffer += decoder.decode(chunk, { stream: true })
      const parsed = parseAiHostSseBlocks(buffer)
      buffer = parsed.rest
      for (const event of parsed.events) handle(event)
    })
    buffer += decoder.decode()
    for (const event of parseAiHostFinalSseBlock(buffer)) handle(event)

    return {
      text: finalText,
      ...(finalReasoning === undefined ? {} : { reasoning: finalReasoning }),
      toolCalls: finalToolCalls,
    }
  }

  /**
   * 追加消息到会话。
   * POST /sessions/{id}/turn/append → 写入历史，不触发 LLM 回复。
   * 校验响应体 sessionId/turnId 一致性，确保消息写入正确的会话和轮次。
   */
  async appendMessages(input: AiHostAppendMessagesInput): Promise<void> {
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
}

// ═══════════════════════════════════════════════════════
// 附件上传（独立函数）
// ═══════════════════════════════════════════════════════

/**
 * 上传附件到 AI 服务。
 * 使用 FormData 格式 POST /upload，
 * 返回上传后的文件 ID、文件名、大小和 MIME 类型。
 */
export async function uploadAiHostAttachment(
  file: File,
  options: AiHostFetchTransportOptions = {},
): Promise<AiHostUploadedAttachment> {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const fetchClient = resolveFetch(options.fetch)
  const getHeaders: AiHostHeadersProvider = options.getHeaders ?? (() => ({}))
  const form = new FormData()
  form.append('file', file)

  const response = await fetchClient(`${baseUrl}/upload`, {
    method: 'POST',
    headers: await Promise.resolve(getHeaders()),
    body: form,
  })
  await assertOkResponse(response, 'AI attachment upload')
  const body = unwrapApiEnvelope(await readResponseJson(response))
  if (!isRecord(body) || typeof body['fileId'] !== 'string' || body['fileId'].trim().length === 0) {
    throw new Error('AI upload response missing fileId')
  }
  return {
    fileId: body['fileId'].trim(),
    name: typeof body['name'] === 'string' && body['name'].trim().length > 0 ? body['name'] : file.name,
    size: typeof body['size'] === 'number' && Number.isFinite(body['size']) ? body['size'] : file.size,
    mimeType: typeof body['mimeType'] === 'string' && body['mimeType'].trim().length > 0 ? body['mimeType'] : file.type,
  }
}
