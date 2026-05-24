/**
 * AI turn APP SSE event collector.
 *
 * This module is pure orchestration: callers provide an APP SSE source and this
 * collector aggregates ai-turn-* events into one turn result.
 */

import { createAiHostStreamKey } from '../business/business-scope'
import type { AiHostStreamEvent } from '../chat/chat-types'
import type { AiHostAppSseEvent } from '../transport/app-sse-events'
import { isRecord } from '../transport/http-utils'
import type {
  AiHostAppSseEventSource,
  AiHostStreamTurnInput,
  AiHostStreamTurnResult,
  AiHostTransportToolCall,
} from '../transport/transport-types'

const AI_TURN_EVENT_NAMES = [
  'ai-turn-delta',
  'ai-turn-reasoning',
  'ai-turn-usage',
  'ai-turn-result',
  'ai-turn-error',
  'ai-turn-done',
] as const

const AI_TURN_EVENT_TIMEOUT_MS = 300_000

type AiTurnEventName = typeof AI_TURN_EVENT_NAMES[number]
type AiTurnEventKind = 'delta' | 'reasoning' | 'usage' | 'result' | 'error' | 'done'

const AI_TURN_EVENT_KIND_MAP: Record<AiTurnEventName, AiTurnEventKind> = {
  'ai-turn-delta': 'delta',
  'ai-turn-reasoning': 'reasoning',
  'ai-turn-usage': 'usage',
  'ai-turn-result': 'result',
  'ai-turn-error': 'error',
  'ai-turn-done': 'done',
}

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
  const expectedStreamKey = createAiHostStreamKey(input.scope, input.turn.turnId, 'llm-stream')
  const state = new TurnEventState(input)
  const disposers = AI_TURN_EVENT_NAMES.map((name) => source.on(name, (event) => {
    if (!matchesTurnEvent(event, input, expectedStreamKey)) return
    state.handle(toTurnEventKind(name), event)
  }))

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

export class TurnEventState {
  private text = ''
  private reasoning: string | undefined
  private toolCalls: readonly AiHostTransportToolCall[] = []
  private sink: TurnEventStateSink | null = null
  private settled = false

  public constructor(private readonly input: AiHostStreamTurnInput) {}

  public bind(sink: TurnEventStateSink): void {
    this.sink = sink
  }

  public handle(kind: AiTurnEventKind, event: AiHostAppSseEvent): void {
    if (this.settled) return
    this.input.onStreamEvent?.(toStreamEvent(this.input, kind, event))
    if (!event.ok || kind === 'error') {
      this.fail(new Error(formatTurnEventError(event.data)))
      return
    }
    if (kind === 'delta') {
      this.appendDelta(event.data)
      return
    }
    if (kind === 'reasoning') {
      this.appendReasoning(event.data)
      return
    }
    if (kind === 'usage' && isRecord(event.data) && isRecord(event.data['usage'])) {
      this.input.onUsage?.(event.data['usage'])
      return
    }
    if (kind === 'result' && isRecord(event.data)) {
      this.applyResult(event.data)
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
    const delta = isRecord(data) && typeof data['delta'] === 'string'
      ? data['delta']
      : (typeof data === 'string' ? data : '')
    if (delta === '') return
    this.text += delta
    this.input.onDelta?.(delta)
  }

  private appendReasoning(data: unknown): void {
    const reasoning = isRecord(data) && typeof data['reasoning'] === 'string'
      ? data['reasoning']
      : (typeof data === 'string' ? data : '')
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

function matchesTurnEvent(
  event: AiHostAppSseEvent,
  input: AiHostStreamTurnInput,
  expectedStreamKey: string,
): boolean {
  const context = event.context
  return context?.session?.sessionId === input.sessionId
    && context.turn?.turnId === input.turn.turnId
    && (context.stream?.streamKey === undefined || context.stream.streamKey === expectedStreamKey)
}

function toTurnEventKind(name: AiTurnEventName): AiTurnEventKind {
  return AI_TURN_EVENT_KIND_MAP[name]
}

function toStreamEvent(
  input: AiHostStreamTurnInput,
  kind: AiTurnEventKind,
  event: AiHostAppSseEvent,
): AiHostStreamEvent {
  return {
    type: kind,
    data: event.data,
    turnKey: event.context?.turn?.turnKey ?? '',
    streamKey: event.context?.stream?.streamKey ?? createAiHostStreamKey(input.scope, input.turn.turnId, 'llm-stream'),
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
  const rawArguments = fn['arguments']
  return {
    ...(typeof value['id'] === 'string' ? { id: value['id'] } : {}),
    type: typeof value['type'] === 'string' ? value['type'] : 'function',
    function: {
      name: fn['name'],
      ...(rawArguments === undefined ? {} : {
        arguments: typeof rawArguments === 'string' ? rawArguments : JSON.stringify(rawArguments),
      }),
    },
  }
}
