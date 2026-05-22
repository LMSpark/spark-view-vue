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

export async function readAiHostSseStream(
  input: AiHostStreamTurnInput,
  body: ReadableStream<Uint8Array>,
): Promise<AiHostStreamTurnResult> {
  const state = new AiHostSseTurnState(input)
  const decoder = new TextDecoder()
  let buffer = ''

  await readStreamBody(body, (chunk) => {
    buffer += decoder.decode(chunk, { stream: true })
    const parsed = parseAiHostSseBlocks(buffer)
    buffer = parsed.rest
    for (const event of parsed.events) state.handle(event)
  })

  buffer += decoder.decode()
  for (const event of parseAiHostFinalSseBlock(buffer)) state.handle(event)

  return state.result()
}

class AiHostSseTurnState {
  private finalText = ''
  private finalReasoning: string | undefined
  private finalToolCalls: readonly AiHostTransportToolCall[] = []

  public constructor(private readonly input: AiHostStreamTurnInput) {}

  public handle(parsedEvent: AiHostParsedSseEvent): void {
    const rawPayload = tryParseJson(parsedEvent.data)
    const payload = unwrapApiEnvelope(rawPayload)
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

  public result(): AiHostStreamTurnResult {
    return {
      text: this.finalText,
      ...(this.finalReasoning === undefined ? {} : { reasoning: this.finalReasoning }),
      toolCalls: this.finalToolCalls,
    }
  }

  private appendDelta(payload: unknown): void {
    const delta = isRecord(payload) && typeof payload['delta'] === 'string'
      ? payload['delta']
      : (typeof payload === 'string' ? payload : '')
    if (delta === '') return
    this.finalText += delta
    this.input.onDelta?.(delta)
  }

  private appendReasoning(payload: unknown): void {
    const reasoning = isRecord(payload) && typeof payload['reasoning'] === 'string'
      ? payload['reasoning']
      : (typeof payload === 'string' ? payload : '')
    if (reasoning === '') return
    this.finalReasoning = `${this.finalReasoning ?? ''}${reasoning}`
    this.input.onReasoning?.(reasoning)
  }

  private applyResult(payload: Readonly<Record<string, unknown>>): void {
    const responseSessionId = typeof payload['sessionId'] === 'string' ? payload['sessionId'] : ''
    const responseTurnId = typeof payload['turnId'] === 'string' ? payload['turnId'] : ''
    if (responseSessionId !== this.input.sessionId) {
      throw new Error('AI stream result sessionId mismatch')
    }
    if (responseTurnId !== this.input.turn.turnId) {
      throw new Error('AI stream result turnId mismatch')
    }
    if (typeof payload['text'] === 'string') this.finalText = payload['text']
    if (typeof payload['reasoning'] === 'string') this.finalReasoning = payload['reasoning']
    this.finalToolCalls = readToolCalls(payload['toolCalls'])
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
