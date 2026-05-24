import { describe, expect, it } from 'vitest'

import {
  createAiHostTransportTurn,
  createTurnEventCollector,
  type AiHostAppSseEvent,
  type AiHostAppSseEventName,
  type AiHostAppSseEventSource,
  type AiHostStreamEvent,
  type AiHostStreamTurnInput,
} from '../host'

type TurnEventKind = 'delta' | 'reasoning' | 'usage' | 'result' | 'error' | 'done'

type TestEventHub = AiHostAppSseEventSource & Readonly<{
  emit(event: AiHostAppSseEvent): void
  listenerCount(): number
}>

const scope = {
  businessRegistrationId: 'demoRuntime',
  businessInstanceId: 'business-a',
  instanceId: 'business-a',
  runtimeInstanceId: 'business-a',
}

const turn = {
  turnId: 'turn-1',
  seq: 1,
  baseRevision: 0,
  queuedAt: '2026-05-20T00:00:00.000Z',
  startedAt: '2026-05-20T00:00:00.000Z',
  maxParallelTurns: 1,
}

const turnKey = 'demoRuntime::business-a::turn-1'
const streamKey = 'demoRuntime::business-a::turn-1::llm-stream'

const eventNames: Record<TurnEventKind, AiHostAppSseEventName> = {
  delta: 'ai-turn-delta',
  reasoning: 'ai-turn-reasoning',
  usage: 'ai-turn-usage',
  result: 'ai-turn-result',
  error: 'ai-turn-error',
  done: 'ai-turn-done',
}

function createTestEventHub(): TestEventHub {
  const listeners = new Map<string, Set<(event: AiHostAppSseEvent) => void>>()
  return {
    on(name, listener) {
      let set = listeners.get(name)
      if (set === undefined) {
        set = new Set()
        listeners.set(name, set)
      }
      set.add(listener)
      return () => {
        set?.delete(listener)
        if (set?.size === 0) listeners.delete(name)
      }
    },
    emit(event) {
      const set = listeners.get(event.name)
      if (set === undefined) return
      for (const listener of set) listener(event)
    },
    listenerCount() {
      let count = 0
      for (const set of listeners.values()) count += set.size
      return count
    },
  }
}

function createTurnInput(callbacks: Partial<Pick<
  AiHostStreamTurnInput,
  'onDelta' | 'onReasoning' | 'onUsage' | 'onStreamEvent' | 'signal'
>> = {}): AiHostStreamTurnInput {
  return {
    sessionId: 'session-1',
    scope,
    turn,
    systemPrompt: 'system',
    tools: [],
    messages: [{ role: 'user', content: 'hello' }],
    ...callbacks,
  }
}

function createTurnAppEvent(
  kind: TurnEventKind,
  data: unknown,
  overrides: Partial<AiHostAppSseEvent> = {},
): AiHostAppSseEvent {
  const name = eventNames[kind]
  return {
    name,
    ok: kind !== 'error',
    data,
    rawData: JSON.stringify(data),
    rawPayload: data,
    protocolVersion: 4,
    context: {
      requestId: 'request-1',
      session: { sessionId: 'session-1' },
      turn: { turnId: 'turn-1', turnKey, seq: 1, baseRevision: 0 },
      stream: { streamId: 'llm-stream', streamKey },
      scope: {
        moduleId: 'demoRuntime',
        moduleInstanceId: 'business-a',
        instanceId: 'business-a',
      },
    },
    event: { transport: 'sse', name, terminal: kind === 'done' || kind === 'error' },
    legacy: false,
    ...overrides,
  }
}

describe('createTurnEventCollector', () => {
  it('aggregates APP SSE events into one turn result and relays callbacks', async () => {
    const hub = createTestEventHub()
    const deltas: string[] = []
    const reasoning: string[] = []
    const usages: Record<string, unknown>[] = []
    const streamEvents: AiHostStreamEvent[] = []
    const collector = createTurnEventCollector({
      input: createTurnInput({
        onDelta: (value) => deltas.push(value),
        onReasoning: (value) => reasoning.push(value),
        onUsage: (value) => usages.push(value),
        onStreamEvent: (event) => streamEvents.push(event),
      }),
      source: hub,
      timeoutMs: 1_000,
    })

    hub.emit(createTurnAppEvent('delta', { delta: 'he' }))
    hub.emit(createTurnAppEvent('reasoning', { reasoning: 'thinking' }))
    hub.emit(createTurnAppEvent('usage', { usage: { totalTokens: 3 } }))
    hub.emit(createTurnAppEvent('result', {
      text: 'hello',
      toolCalls: [{ id: 'call-1', type: 'function', function: { name: 'setReason', arguments: '{}' } }],
    }))

    await expect(collector.result).resolves.toEqual({
      text: 'hello',
      reasoning: 'thinking',
      toolCalls: [{
        id: 'call-1',
        type: 'function',
        function: { name: 'setReason', arguments: '{}' },
      }],
    })
    expect(deltas).toEqual(['he'])
    expect(reasoning).toEqual(['thinking'])
    expect(usages).toEqual([{ totalTokens: 3 }])
    expect(streamEvents.map((event) => event.type)).toEqual(['delta', 'reasoning', 'usage', 'result'])
    expect(streamEvents[0]?.streamKey).toBe(streamKey)
    expect(hub.listenerCount()).toBe(0)
  })

  it('filters APP SSE events from other turns', async () => {
    const hub = createTestEventHub()
    const collector = createTurnEventCollector({
      input: createTurnInput(),
      source: hub,
      timeoutMs: 1_000,
    })

    hub.emit(createTurnAppEvent('result', { text: 'wrong' }, {
      context: {
        requestId: 'request-2',
        session: { sessionId: 'other-session' },
        turn: { turnId: 'turn-1' },
        stream: { streamKey },
      },
    }))
    hub.emit(createTurnAppEvent('result', { text: 'right' }))

    await expect(collector.result).resolves.toEqual({ text: 'right', toolCalls: [] })
    expect(hub.listenerCount()).toBe(0)
  })

  it('rejects APP SSE turn errors', async () => {
    const hub = createTestEventHub()
    const streamEvents: AiHostStreamEvent[] = []
    const collector = createTurnEventCollector({
      input: createTurnInput({ onStreamEvent: (event) => streamEvents.push(event) }),
      source: hub,
      timeoutMs: 1_000,
    })

    hub.emit(createTurnAppEvent('error', {
      code: 'LLM_TOOL_CALL_FAILED',
      message: 'LLM tool-call request failed',
    }))

    await expect(collector.result).rejects.toThrow('LLM tool-call request failed (code=LLM_TOOL_CALL_FAILED)')
    expect(streamEvents).toHaveLength(1)
    expect(streamEvents[0]?.type).toBe('error')
    expect(hub.listenerCount()).toBe(0)
  })

  it('times out and cleans listeners when no matching turn event arrives', async () => {
    const hub = createTestEventHub()
    const collector = createTurnEventCollector({
      input: createTurnInput(),
      source: hub,
      timeoutMs: 1,
    })

    await expect(collector.result).rejects.toThrow('AI turn timed out waiting for APP SSE events: turnId=turn-1')
    expect(hub.listenerCount()).toBe(0)
  })

  it('builds stable turn payload identity for APP-owned HTTP commands', () => {
    const input = createTurnInput()

    expect(createAiHostTransportTurn(input)).toEqual({
      turnId: 'turn-1',
      turnKey,
    })
    expect(createAiHostTransportTurn(input, 'llm-stream')).toEqual({
      turnId: 'turn-1',
      turnKey,
      streamKey,
    })
  })
})
