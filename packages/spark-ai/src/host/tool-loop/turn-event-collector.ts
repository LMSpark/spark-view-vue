/**
 * AI turn APP SSE event collector.
 *
 * This module is pure orchestration: callers provide an APP SSE source and this
 * collector aggregates neutral llm-frame events into one turn result.
 */

import type { AiHostStreamEvent } from '../chat/chat-types'
import type { AiHostAppSseEvent } from '../transport/app-sse-events'
import { isRecord } from '@spark-view/spark-utils'
import type {
  AiHostAppSseEventSource,
  AiHostStreamTurnInput,
  AiHostStreamTurnResult,
  AiHostTransportToolCall,
} from '../transport/transport-types'

const LLM_FRAME_EVENT_NAME = 'llm-frame'

const AI_TURN_EVENT_TIMEOUT_MS = 300_000

type AiTurnEventKind = 'delta' | 'reasoning' | 'result' | 'error' | 'done'

type LlmFramePayload = Readonly<{
  sessionId: string
  turnId: string
  frame: LlmFrame
}>

type LlmFrame = Readonly<{
  type: string
  data?: unknown
}>

type TurnEventCollectorInput = Readonly<{
  input: AiHostStreamTurnInput
  source: AiHostAppSseEventSource
  timeoutMs?: number
}>

export type TurnEventCollector = Readonly<{
  result: Promise<AiHostStreamTurnResult>
  close(): void
}>

export function createTurnEventCollector(options: TurnEventCollectorInput): TurnEventCollector {
  const { input, source } = options
  const timeoutMs = options.timeoutMs ?? AI_TURN_EVENT_TIMEOUT_MS
  const state = new TurnEventState(input)
  const disposers = [source.on(LLM_FRAME_EVENT_NAME, (event) => {
    const payload = readMatchingLlmFrame(event, input)
    if (payload === null) return
    state.handle(toTurnEventKind(payload.frame), event, payload.frame)
  })]

  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    for (const dispose of disposers) dispose()
    if (timeoutId !== null) clearTimeout(timeoutId)
  }
  const result = new Promise<AiHostStreamTurnResult>((resolve, reject) => {
    state.bind({
      resolve: (value) => {
        cleanup()
        resolve(value)
      },
      reject: (error) => {
        cleanup()
        reject(error)
      },
    })
    timeoutId = setTimeout(() => {
      state.fail(new Error(`AI turn timed out waiting for APP SSE events: turnId=${input.turn.turnId}`))
    }, timeoutMs)
    input.signal?.addEventListener('abort', () => {
      state.fail(new Error('AI turn aborted'))
    }, { once: true })
  })
  result.finally(cleanup).catch(() => undefined)

  return {
    result,
    close() {
      cleanup()
      state.close()
    },
  }
}

type TurnEventStateSink = Readonly<{
  resolve(result: AiHostStreamTurnResult): void
  reject(error: unknown): void
}>

class TurnEventState {
  private text = ''
  private reasoning: string | undefined
  private toolCalls: readonly AiHostTransportToolCall[] = []
  private sink: TurnEventStateSink | null = null
  private settled = false

  public constructor(private readonly input: AiHostStreamTurnInput) {}

  public bind(sink: TurnEventStateSink): void {
    this.sink = sink
  }

  public handle(kind: AiTurnEventKind, event: AiHostAppSseEvent, frame: LlmFrame): void {
    if (this.settled) return
    this.input.onStreamEvent?.(toStreamEvent(this.input, kind, frame))
    if (!event.ok || kind === 'error') {
      this.fail(new Error(formatTurnEventError(frame.data ?? event.data)))
      return
    }
    if (kind === 'delta') {
      this.appendDelta(frame.data)
      return
    }
    if (kind === 'reasoning') {
      this.appendReasoning(frame.data)
      return
    }
    if (kind === 'result' && isRecord(frame.data)) {
      this.applyResult(frame.data)
      this.complete()
      return
    }
    if (kind === 'done') {
      this.complete()
    }
  }

  public fail(error: unknown): void {
    if (this.settled) return
    this.settled = true
    this.sink?.reject(error)
  }

  public close(): void {
    this.settled = true
  }

  private appendDelta(data: unknown): void {
    const delta = readFrameText(data, 'delta')
    if (delta === '') return
    this.text += delta
    this.input.onDelta?.(delta)
  }

  private appendReasoning(data: unknown): void {
    const reasoning = readFrameText(data, 'reasoning') || readFrameText(data, 'delta')
    if (reasoning === '') return
    this.reasoning = `${this.reasoning ?? ''}${reasoning}`
    this.input.onReasoning?.(reasoning)
  }

  private applyResult(data: Readonly<Record<string, unknown>>): void {
    if (typeof data['text'] === 'string') this.text = data['text']
    if (typeof data['reasoning'] === 'string') this.reasoning = data['reasoning']
    const toolCalls = readToolCalls(data['toolCalls']) ?? readToolCalls(data['tool_calls'])
    if (toolCalls !== null) this.toolCalls = toolCalls
  }

  private complete(): void {
    if (this.settled) return
    this.settled = true
    this.sink?.resolve({
      text: this.text,
      ...(this.reasoning === undefined ? {} : { reasoning: this.reasoning }),
      toolCalls: this.toolCalls,
    })
  }
}

function readMatchingLlmFrame(
  event: AiHostAppSseEvent,
  input: AiHostStreamTurnInput,
): LlmFramePayload | null {
  if (event.name !== LLM_FRAME_EVENT_NAME || !isRecord(event.data)) return null
  const sessionId = event.data['sessionId']
  const turnId = event.data['turnId']
  const frame = event.data['frame']
  if (sessionId !== input.sessionId || turnId !== input.turn.turnId || !isRecord(frame)) {
    return null
  }
  const type = frame['type']
  if (typeof type !== 'string') return null
  return {
    sessionId,
    turnId,
    frame: {
      type,
      data: frame['data'],
    },
  }
}

function toTurnEventKind(frame: LlmFrame): AiTurnEventKind {
  if (frame.type === 'error') return 'error'
  if (frame.type === 'done') return 'done'
  if (frame.type === 'message.completed') return 'result'
  if (frame.type === 'message.delta' && isRecord(frame.data) && frame.data['part'] === 'reasoning') {
    return 'reasoning'
  }
  return 'delta'
}

function toStreamEvent(
  input: AiHostStreamTurnInput,
  kind: AiTurnEventKind,
  frame: LlmFrame,
): AiHostStreamEvent {
  return {
    type: kind,
    data: frame.data,
    turnKey: '',
    streamKey: '',
    scope: {
      businessRegistrationId: input.scope.businessRegistrationId,
      businessInstanceId: input.scope.businessInstanceId,
      eventModuleId: 'llm',
      turnId: input.turn.turnId,
    },
  }
}

function formatTurnEventError(data: unknown): string {
  if (typeof data === 'string' && data.trim() !== '') return data
  if (!isRecord(data)) return 'AI turn failed'
  const message = typeof data['message'] === 'string' && data['message'].trim() !== ''
    ? data['message']
    : 'AI turn failed'
  const code = typeof data['code'] === 'string' && data['code'].trim() !== ''
    ? data['code']
    : ''
  return code === '' ? message : `${message} (code=${code})`
}

function readFrameText(data: unknown, key: string): string {
  if (isRecord(data) && typeof data[key] === 'string') return data[key]
  return typeof data === 'string' ? data : ''
}

function readToolCalls(value: unknown): readonly AiHostTransportToolCall[] | null {
  if (!Array.isArray(value)) return null
  return value
    .map(normalizeToolCall)
    .filter((call): call is AiHostTransportToolCall => call !== null)
}

function normalizeToolCall(value: unknown): AiHostTransportToolCall | null {
  if (!isRecord(value)) return null
  const fn = isRecord(value['function']) ? value['function'] : null
  if (fn === null || typeof fn['name'] !== 'string' || fn['name'].trim() === '') return null
  // AiHostTransportToolCall.id is required per OpenAI tool_call spec.
  // Backends that produce tool calls without ids are non-conformant;
  // the collector treats these as malformed and discards them rather
  // than silently fabricating ids.
  if (typeof value['id'] !== 'string' || value['id'].trim().length === 0) return null
  const rawArguments = fn['arguments']
  return {
    id: value['id'],
    type: 'function',
    function: {
      name: fn['name'],
      arguments: typeof rawArguments === 'string' ? rawArguments : JSON.stringify(rawArguments ?? {}),
    },
  }
}
