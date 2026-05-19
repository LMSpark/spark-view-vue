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

export type AiHostHeadersProvider = () => HeadersInit | Promise<HeadersInit>

export type AiHostFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface AiHostFetchTransportOptions {
  readonly baseUrl?: string | undefined
  readonly fetch?: AiHostFetch | undefined
  readonly getHeaders?: AiHostHeadersProvider | undefined
  readonly protocolVersion?: number | undefined
}

export interface AiHostParsedSseEvent {
  readonly event: string
  readonly data: string
}

export interface AiHostUploadedAttachment {
  readonly fileId: string
  readonly name: string
  readonly size: number
  readonly mimeType: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

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

function unwrapApiEnvelope(value: unknown): unknown {
  if (!isApiEnvelope(value)) return value
  if (value.ok) return value.data
  const message = isRecord(value.error) && typeof value.error['message'] === 'string'
    ? value.error['message']
    : 'AI request failed'
  throw new Error(message)
}

function isTransportToolFunction(value: unknown): value is AiHostTransportToolCall['function'] {
  return value === undefined || (isRecord(value)
    && (value['name'] === undefined || typeof value['name'] === 'string')
    && (value['arguments'] === undefined || typeof value['arguments'] === 'string'))
}

function isTransportToolCall(value: unknown): value is AiHostTransportToolCall {
  return isRecord(value)
    && (value['id'] === undefined || typeof value['id'] === 'string')
    && (value['type'] === undefined || typeof value['type'] === 'string')
    && isTransportToolFunction(value['function'])
}

function readToolCalls(value: unknown): readonly AiHostTransportToolCall[] {
  return Array.isArray(value) ? value.filter(isTransportToolCall) : []
}

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

function parseAiHostFinalSseBlock(buffer: string): readonly AiHostParsedSseEvent[] {
  const normalized = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const parsed = normalized.trim() === '' ? null : parseAiHostSseBlock(normalized)
  return parsed === null ? [] : [parsed]
}

function resolveFetch(fetchImpl: AiHostFetch | undefined): AiHostFetch {
  if (fetchImpl !== undefined) return fetchImpl
  if (typeof fetch !== 'function') {
    throw new Error('AiHostFetchTransport requires a fetch implementation')
  }
  return fetch.bind(globalThis)
}

function normalizeBaseUrl(value: string | undefined): string {
  return (value ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function toTransportTurn(input: AiHostStreamTurnInput['turn']): { turnId: string } {
  return { turnId: input.turnId }
}

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

async function readResponseJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.trim() === '') return null
  return tryParseJson(text)
}

async function assertOkResponse(response: Response, action: string): Promise<void> {
  if (response.ok) return
  const body = await response.text()
  throw new Error(`${action} failed: ${response.status} ${body}`)
}

export class AiHostFetchTransport implements AiHostTransport {
  private readonly baseUrl: string
  private readonly fetchImpl: AiHostFetch
  private readonly getHeaders: AiHostHeadersProvider
  private readonly protocolVersion: number

  constructor(options: AiHostFetchTransportOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl)
    this.fetchImpl = resolveFetch(options.fetch)
    this.getHeaders = options.getHeaders ?? (() => ({}))
    this.protocolVersion = options.protocolVersion ?? DEFAULT_PROTOCOL_VERSION
  }

  private async jsonHeaders(): Promise<Headers> {
    const headers = new Headers(await Promise.resolve(this.getHeaders()))
    headers.set('Content-Type', 'application/json')
    return headers
  }

  async streamTurn(input: AiHostStreamTurnInput): Promise<AiHostStreamTurnResult> {
    const response = await this.fetchImpl(
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

    const handle = (parsedEvent: AiHostParsedSseEvent): void => {
      const rawPayload = tryParseJson(parsedEvent.data)
      const payload = unwrapApiEnvelope(rawPayload)
      input.onSseEvent?.(createSseEvent(parsedEvent, payload, input.scope, input.turn.turnId))

      if (parsedEvent.event === 'error') {
        throw new Error(typeof payload === 'string' ? payload : 'AI stream failed')
      }

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

      if (parsedEvent.event === 'usage' && isRecord(payload) && isRecord(payload['usage'])) {
        input.onUsage?.(payload['usage'])
        return
      }

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

  async appendMessages(input: AiHostAppendMessagesInput): Promise<void> {
    const response = await this.fetchImpl(
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

export async function uploadAiHostAttachment(
  file: File,
  options: AiHostFetchTransportOptions = {},
): Promise<AiHostUploadedAttachment> {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const fetchImpl = resolveFetch(options.fetch)
  const getHeaders: AiHostHeadersProvider = options.getHeaders ?? (() => ({}))
  const form = new FormData()
  form.append('file', file)

  const response = await fetchImpl(`${baseUrl}/upload`, {
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
