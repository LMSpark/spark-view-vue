import type { AiScenarioAgentSessionContext, AiScenarioSseEventEnvelope } from '../contracts/function-call-contracts'
import type { AiBrowserLlmClient, AiBrowserLlmGenerateRequest, AiBrowserLlmGenerateResponse } from '../contracts/llm-contracts'

/**
 * ==============================================
 * LLM 层：Scenario SSE LLM 客户端
 * ==============================================
 * 功能分区：
 * 1) 连接 AI 框架维护的 SSE turn 流，不直接访问模型 provider。
 * 2) 支持固定 sessionId、动态 getSessionId、resolveSession 与自定义 streamUrlBuilder。
 * 3) 解析当前后端事件（delta/reasoning/result/error/done/usage）与未来统一信封。
 * 4) 对外仍实现 AiBrowserLlmClient.generate，兼容现有 planner 调用点。
 *
 * 边界说明：
 * - 本客户端不接收 apiKey，也不拼接 provider 请求，避免浏览器暴露模型密钥。
 * - 会话、滑动窗口、provider 调度、子 Agent 编排由 AI 框架负责。
 * - 前端只提供 sessionId 或 session resolver，并消费最终 { text, raw }。
 *
 * 时序分区：
 * 1) generate(request) 解析本轮所属会话。
 * 2) 构造 stream URL、headers 与可选 body。
 * 3) fetch 打开 SSE 流并逐条归一化事件。
 * 4) 聚合 delta/reasoning，遇到 result 记录最终结果，遇到 done 结束。
 * 5) 返回最终 text；若没有 result，则以 delta 聚合文本作为兼容回退。
 */

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：公开选项与内部类型
// ═══════════════════════════════════════════════════════════════════════════

export type ScenarioSseFetch = (input: string, init: RequestInit) => Promise<Response>

export type ScenarioSseSessionResolver = (
  request: AiBrowserLlmGenerateRequest,
) => AiScenarioAgentSessionContext | string | Promise<AiScenarioAgentSessionContext | string>

export type ScenarioSseStreamUrlBuilder = (session: AiScenarioAgentSessionContext) => string

export type ScenarioSseRequestBodyBuilder = (
  request: AiBrowserLlmGenerateRequest,
  session: AiScenarioAgentSessionContext,
) => unknown

export interface ScenarioSseLlmClientOptions {
  /** 兼容旧 /api/ai/sessions/{sessionId}/turn/stream 的默认 baseUrl。 */
  baseUrl?: string
  /** 固定会话 ID：适合单个聊天面板或调用方已经绑定会话的场景。 */
  sessionId?: string
  /** 动态会话 ID：适合前端同时维护多个会话面板时按当前 UI 状态取值。 */
  getSessionId?: () => string | Promise<string>
  /** 完整会话解析器：适合未来主/子 Agent 或跨框架会话上下文。 */
  resolveSession?: ScenarioSseSessionResolver
  /** 自定义流地址构造器：适配未来 AI 框架统一 endpoint。 */
  streamUrlBuilder?: ScenarioSseStreamUrlBuilder
  /** 可选请求体构造器；旧 turn/stream 默认不需要 body。 */
  requestBodyBuilder?: ScenarioSseRequestBodyBuilder
  /** 静态请求头。 */
  headers?: Record<string, string>
  /** 动态请求头，常用于租户、项目、认证上下文。 */
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>
  /** fetch credentials 选项，由接入方按同源/跨域策略决定。 */
  credentials?: RequestCredentials
  /** 测试或特殊运行时可注入 fetch。 */
  fetchImpl?: ScenarioSseFetch
  /** 原始 SSE 事件归一化后的观察回调，用于调试面板或日志。 */
  onEvent?: (event: AiScenarioSseEventEnvelope) => void
}

interface RawSseEvent {
  event?: string
  id?: string
  data: string
}

interface SerializedBody {
  body?: string
  contentType?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：对象读取与文本提取工具
// ═══════════════════════════════════════════════════════════════════════════

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwnKey(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function readStringField(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined
  const field = value[key]
  return typeof field === 'string' ? field : undefined
}

function readNestedString(value: unknown, outerKey: string, innerKey: string): string | undefined {
  if (!isRecord(value)) return undefined
  return readStringField(value[outerKey], innerKey)
}

function parseJsonOrText(data: string): unknown {
  const trimmed = data.trim()
  if (trimmed === '') return ''
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return data
  }
}

function extractPayload(parsed: unknown): unknown {
  if (isRecord(parsed) && hasOwnKey(parsed, 'payload')) {
    return parsed['payload']
  }
  return parsed
}

function extractTextPayload(payload: unknown, primaryKey: 'delta' | 'reasoning' | 'text'): string {
  if (typeof payload === 'string') return payload
  const direct = readStringField(payload, primaryKey)
  if (direct !== undefined) return direct
  const nestedResult = readNestedString(payload, 'result', primaryKey)
  if (nestedResult !== undefined) return nestedResult
  const nestedMessage = readNestedString(payload, 'message', 'content')
  return nestedMessage ?? ''
}

function extractErrorMessage(payload: unknown): string {
  if (typeof payload === 'string') return payload
  const direct = readStringField(payload, 'error')
  if (direct !== undefined) return direct
  const message = readStringField(payload, 'message')
  if (message !== undefined) return message
  const nestedErrorMessage = readNestedString(payload, 'error', 'message')
  if (nestedErrorMessage !== undefined) return nestedErrorMessage
  return JSON.stringify(payload)
}

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：SSE 行协议解析
// ═══════════════════════════════════════════════════════════════════════════

function createEmptySseState(): { event?: string; id?: string; dataLines: string[] } {
  return { dataLines: [] }
}

function flushSseState(state: { event?: string; id?: string; dataLines: string[] }): RawSseEvent | undefined {
  if (state.event === undefined && state.id === undefined && state.dataLines.length === 0) return undefined
  return {
    ...(state.event !== undefined ? { event: state.event } : {}),
    ...(state.id !== undefined ? { id: state.id } : {}),
    data: state.dataLines.join('\n'),
  }
}

function consumeSseLine(
  state: { event?: string; id?: string; dataLines: string[] },
  line: string,
): RawSseEvent | undefined {
  if (line === '') {
    const event = flushSseState(state)
    delete state.event
    delete state.id
    state.dataLines = []
    return event
  }

  if (line.startsWith(':')) return undefined

  const separatorIndex = line.indexOf(':')
  const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line
  const rawValue = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : ''
  const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue

  if (field === 'event') state.event = value
  if (field === 'id') state.id = value
  if (field === 'data') state.dataLines.push(value)

  return undefined
}

async function* readSseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<RawSseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const state = createEmptySseState()

  try {
    let chunk = await reader.read()
    while (!chunk.done) {
      buffer += decoder.decode(chunk.value, { stream: true })

      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '')
        buffer = buffer.slice(newlineIndex + 1)
        const event = consumeSseLine(state, line)
        if (event !== undefined) yield event
        newlineIndex = buffer.indexOf('\n')
      }

      chunk = await reader.read()
    }

    buffer += decoder.decode()
    if (buffer !== '') {
      const event = consumeSseLine(state, buffer.replace(/\r$/, ''))
      if (event !== undefined) yield event
    }
    const trailingEvent = flushSseState(state)
    if (trailingEvent !== undefined) yield trailingEvent
  } finally {
    reader.releaseLock()
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：事件归一化
// ═══════════════════════════════════════════════════════════════════════════

function normalizeEventType(raw: RawSseEvent, parsed: unknown): string {
  if (raw.event !== undefined && raw.event !== 'message') return raw.event
  return readStringField(parsed, 'type') ?? readStringField(parsed, 'event') ?? raw.event ?? 'unknown'
}

function normalizeSseEvent(
  raw: RawSseEvent,
  session: AiScenarioAgentSessionContext,
): AiScenarioSseEventEnvelope {
  const parsed = parseJsonOrText(raw.data)
  const payload = extractPayload(parsed)
  const requestId = readStringField(parsed, 'requestId') ?? session.requestId
  const turnId = readStringField(parsed, 'turnId') ?? session.turnId
  const agentId = readStringField(parsed, 'agentId') ?? session.agentId
  const parentSessionId = readStringField(parsed, 'parentSessionId') ?? session.parentSessionId
  return {
    type: normalizeEventType(raw, parsed),
    sessionId: readStringField(parsed, 'sessionId') ?? session.sessionId,
    ...(requestId !== undefined ? { requestId } : {}),
    ...(turnId !== undefined ? { turnId } : {}),
    ...(agentId !== undefined ? { agentId } : {}),
    ...(parentSessionId !== undefined ? { parentSessionId } : {}),
    payload,
    raw: {
      event: raw,
      parsed,
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：会话、URL、请求体解析
// ═══════════════════════════════════════════════════════════════════════════

function normalizeSession(value: AiScenarioAgentSessionContext | string): AiScenarioAgentSessionContext {
  if (typeof value === 'string') return { sessionId: value }
  return value
}

function assertValidSession(session: AiScenarioAgentSessionContext): void {
  if (session.sessionId.trim() === '') {
    throw new Error('Scenario SSE LLM client requires a non-empty sessionId.')
  }
}

async function resolveSessionContext(
  request: AiBrowserLlmGenerateRequest,
  options: ScenarioSseLlmClientOptions,
): Promise<AiScenarioAgentSessionContext> {
  if (options.resolveSession !== undefined) {
    const session = normalizeSession(await options.resolveSession(request))
    assertValidSession(session)
    return session
  }

  if (options.getSessionId !== undefined) {
    const session = normalizeSession(await options.getSessionId())
    assertValidSession(session)
    return session
  }

  if (options.sessionId !== undefined) {
    const session = normalizeSession(options.sessionId)
    assertValidSession(session)
    return session
  }

  throw new Error('Scenario SSE LLM client requires sessionId, getSessionId, or resolveSession.')
}

function buildDefaultStreamUrl(baseUrl: string | undefined, session: AiScenarioAgentSessionContext): string {
  const normalizedBaseUrl = (baseUrl ?? '/api/ai/sessions').replace(/\/+$/, '')
  return `${normalizedBaseUrl}/${encodeURIComponent(session.sessionId)}/turn/stream`
}

function resolveStreamUrl(options: ScenarioSseLlmClientOptions, session: AiScenarioAgentSessionContext): string {
  if (options.streamUrlBuilder !== undefined) return options.streamUrlBuilder(session)
  if (session.streamUrl !== undefined && session.streamUrl.trim() !== '') return session.streamUrl
  return buildDefaultStreamUrl(options.baseUrl, session)
}

function serializeRequestBody(value: unknown): SerializedBody {
  if (value === undefined) return {}
  return {
    body: JSON.stringify(value),
    contentType: 'application/json',
  }
}

async function buildHeaders(
  options: ScenarioSseLlmClientOptions,
  body: SerializedBody,
): Promise<Record<string, string>> {
  const dynamicHeaders = options.getHeaders !== undefined ? await options.getHeaders() : {}
  return {
    Accept: 'text/event-stream',
    ...(body.contentType !== undefined ? { 'Content-Type': body.contentType } : {}),
    ...(options.headers ?? {}),
    ...dynamicHeaders,
  }
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 流程分区：客户端工厂
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 创建 Scenario SSE LLM 客户端。
 *
 * 典型接入：
 * - 旧 session SSE：`createScenarioSseLlmClient({ sessionId })`
 * - 多会话前端：`createScenarioSseLlmClient({ getSessionId })`
 * - 未来 AI 框架：`createScenarioSseLlmClient({ resolveSession, streamUrlBuilder, requestBodyBuilder })`
 */
export function createScenarioSseLlmClient(options: ScenarioSseLlmClientOptions): AiBrowserLlmClient {
  async function generate(request: AiBrowserLlmGenerateRequest): Promise<AiBrowserLlmGenerateResponse> {
    // 阶段 1：解析会话；这里不创建会话，避免前端接管通信生命周期。
    const session = await resolveSessionContext(request, options)
    const streamUrl = resolveStreamUrl(options, session)

    // 阶段 2：构造请求。旧 /turn/stream 默认无 body；未来 AI 框架可通过 requestBodyBuilder 注入。
    const requestBody = options.requestBodyBuilder !== undefined
      ? serializeRequestBody(await options.requestBodyBuilder(request, session))
      : serializeRequestBody(undefined)
    const headers = await buildHeaders(options, requestBody)
    const fetchImpl = options.fetchImpl ?? fetch
    const response = await fetchImpl(streamUrl, {
      method: 'POST',
      headers,
      ...(options.credentials !== undefined ? { credentials: options.credentials } : {}),
      ...(request.signal !== undefined ? { signal: request.signal } : {}),
      ...(requestBody.body !== undefined ? { body: requestBody.body } : {}),
    })

    if (!response.ok) {
      const errorBody = await readErrorBody(response)
      throw new Error(`Scenario SSE request failed: ${response.status} ${response.statusText}; body=${errorBody}`)
    }

    if (response.body === null) {
      throw new Error('Scenario SSE response body is empty.')
    }

    // 阶段 3：消费 SSE 事件。result 优先，delta 作为兼容路径聚合。
    const events: AiScenarioSseEventEnvelope[] = []
    const deltaParts: string[] = []
    const reasoningParts: string[] = []
    let finalText: string | undefined
    let streamError = ''

    for await (const rawEvent of readSseEvents(response.body)) {
      const event = normalizeSseEvent(rawEvent, session)
      events.push(event)
      options.onEvent?.(event)

      if (event.type === 'delta') {
        deltaParts.push(extractTextPayload(event.payload, 'delta'))
      }

      if (event.type === 'reasoning') {
        reasoningParts.push(extractTextPayload(event.payload, 'reasoning'))
      }

      if (event.type === 'result') {
        finalText = extractTextPayload(event.payload, 'text')
      }

      if (event.type === 'error') {
        streamError = extractErrorMessage(event.payload)
      }

      if (event.type === 'done') break
    }

    // 阶段 4：错误与最终文本处理。SSE error 必须显式失败，避免静默吞掉后端异常。
    if (streamError !== '') {
      throw new Error(`Scenario SSE error: ${streamError}`)
    }

    const deltaText = deltaParts.join('')
    const text = finalText ?? deltaText
    if (text === '' && events.length === 0) {
      throw new Error('Scenario SSE stream returned no events.')
    }

    return {
      text,
      raw: {
        session,
        events,
        reasoning: reasoningParts.join(''),
      },
    }
  }

  return { generate }
}
