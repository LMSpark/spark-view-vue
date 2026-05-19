import type { FileAttachment } from '@spark-view/spark-component'
import type {
  AiHostAppendMessagesInput,
  AiHostSseEvent,
  AiHostStreamTurnInput,
  AiHostStreamTurnResult,
  AiHostTransport,
  AiHostTransportToolCall,
} from '@spark-view/spark-ai/host'
import {
  createAiHostStreamKey,
  toAiHostRuntimeScope as toHostRuntimeScope,
} from '@spark-view/spark-ai/host'
import { createAuthHeaders, getFetchHttpClient } from '@/services/http'

const PROTOCOL_VERSION = 3

export type AppAiHeaderProvider = () => Record<string, string>

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

function toTransportTurn(input: AiHostStreamTurnInput['turn']): { turnId: string } {
  return { turnId: input.turnId }
}

function readToolCalls(value: unknown): readonly AiHostTransportToolCall[] {
  return Array.isArray(value) ? value.filter(isRecord) as AiHostTransportToolCall[] : []
}

interface ParsedSseEvent {
  readonly event: string
  readonly data: string
}

function parseSseBlocks(buffer: string): { events: ParsedSseEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const rest = parts.pop() ?? ''
  const events = parts.flatMap((block): ParsedSseEvent[] => {
    let event = 'message'
    const dataLines: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice('event:'.length).trim()
      if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trimStart())
    }
    if (dataLines.length === 0) return []
    return [{ event, data: dataLines.join('\n') }]
  })
  return { events, rest }
}

async function readResponseChunks(
  body: ReadableStream<Uint8Array>,
  onChunk: (chunk: Uint8Array) => void,
): Promise<void> {
  for await (const chunk of body) {
    onChunk(chunk)
  }
}

export class FetchAppAiTransport implements AiHostTransport {
  constructor(
    private readonly baseUrl = '/api/ai',
    private readonly getHeaders: AppAiHeaderProvider = createAuthHeaders,
  ) {}

  private jsonHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...this.getHeaders(),
    }
  }

  async streamTurn(input: AiHostStreamTurnInput): Promise<AiHostStreamTurnResult> {
    const response = await getFetchHttpClient().stream({
      url: `${this.baseUrl}/sessions/${encodeURIComponent(input.sessionId)}/turn/stream`,
      method: 'POST',
      headers: this.jsonHeaders(),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      data: {
        protocolVersion: PROTOCOL_VERSION,
        systemPrompt: input.systemPrompt,
        tools: input.tools,
        mode: 'function',
        scope: toHostRuntimeScope(input.scope),
        turn: toTransportTurn(input.turn),
        messages: input.messages,
      },
    })

    const decoder = new TextDecoder()
    let buffer = ''
    let finalText = ''
    let finalReasoning: string | undefined
    let finalToolCalls: readonly AiHostTransportToolCall[] = []

    const handle = (parsedEvent: ParsedSseEvent): void => {
      const rawPayload = tryParseJson(parsedEvent.data)
      const payload = unwrapApiEnvelope(rawPayload)
      const event: AiHostSseEvent = {
        type: parsedEvent.event,
        data: typeof payload === 'string' ? payload : JSON.stringify(payload),
        streamKey: createAiHostStreamKey(input.scope, 'llm', input.turn.turnId),
        scope: {
          businessRegistrationId: input.scope.businessRegistrationId,
          businessInstanceId: input.scope.businessInstanceId,
          eventModuleId: 'llm',
          turnId: input.turn.turnId,
        },
      }
      input.onSseEvent?.(event)

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

    await readResponseChunks(response.body, (chunk) => {
      buffer += decoder.decode(chunk, { stream: true })
      const parsed = parseSseBlocks(buffer)
      buffer = parsed.rest
      for (const event of parsed.events) handle(event)
    })

    return {
      text: finalText,
      ...(finalReasoning === undefined ? {} : { reasoning: finalReasoning }),
      toolCalls: finalToolCalls,
    }
  }

  async appendMessages(input: AiHostAppendMessagesInput): Promise<void> {
    const body = await getFetchHttpClient().post<unknown>(`${this.baseUrl}/sessions/${encodeURIComponent(input.sessionId)}/turn/append`, {
      protocolVersion: PROTOCOL_VERSION,
      scope: toHostRuntimeScope(input.scope),
      turn: toTransportTurn(input.turn),
      messages: input.messages,
    }, {
      headers: this.jsonHeaders(),
    })
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

export async function uploadAppAiAttachment(
  file: File,
  baseUrl = '/api/ai',
  getHeaders: AppAiHeaderProvider = createAuthHeaders,
): Promise<FileAttachment> {
  const form = new FormData()
  form.append('file', file)

  const body = await getFetchHttpClient().post<unknown>(`${baseUrl}/upload`, form, {
    headers: getHeaders(),
  })
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
