/**
 * Fetch + SSE transport for AI Host.
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

  private async jsonHeaders(): Promise<Headers> {
    const headers = new Headers(await Promise.resolve(this.getHeaders()))
    headers.set('Content-Type', 'application/json')
    return headers
  }
}

export { parseAiHostSseBlocks } from './sse-parser'
