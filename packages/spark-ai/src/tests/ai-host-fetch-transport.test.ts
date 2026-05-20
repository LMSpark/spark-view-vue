import { describe, expect, it, vi } from 'vitest'

import {
  AiHostFetchTransport,
  parseAiHostSseBlocks,
  type AiHostFetch,
  type AiHostSseEvent,
} from '../core/host/index'

const encoder = new TextEncoder()

function createStreamResponse(chunks: readonly string[]): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function createJsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function createFetch(fn: AiHostFetch) {
  return vi.fn<AiHostFetch>(fn)
}

const scope = {
  businessRegistrationId: 'pageDesign',
  businessInstanceId: 'page-a',
  instanceId: 'pageDesign:page-a',
  runtimeInstanceId: 'pageDesign:page-a',
}

const turn = {
  turnId: 'turn-1',
  seq: 1,
  baseRevision: 0,
  queuedAt: '2026-05-20T00:00:00.000Z',
  startedAt: '2026-05-20T00:00:00.000Z',
  maxParallelTurns: 1,
}

describe('AiHostFetchTransport', () => {
  it('parses complete SSE blocks and leaves partial data buffered', () => {
    const parsed = parseAiHostSseBlocks('event: delta\r\ndata: hello\r\n\r\nevent: result\r\ndata: {"ok":true}')

    expect(parsed.events).toEqual([{ event: 'delta', data: 'hello' }])
    expect(parsed.rest).toBe('event: result\ndata: {"ok":true}')
  })

  it('streams an AI turn through package-owned SSE transport', async () => {
    const fetchClient = createFetch(async () => createStreamResponse([
      'event: delta\ndata: {"delta":"he"}\n\n',
      'event: reasoning\ndata: {"reasoning":"thinking"}\n\n',
      'event: usage\ndata: {"usage":{"totalTokens":3}}\n\n',
      'event: result\ndata: {"sessionId":"session-1","turnId":"turn-1","text":"hello","toolCalls":[{"id":"call-1","type":"function","function":{"name":"setReason","arguments":"{}"}}]}\n\n',
    ]))
    const transport = new AiHostFetchTransport({
      baseUrl: '/api/ai',
      fetch: fetchClient,
      getHeaders: () => ({ Authorization: 'Bearer token' }),
    })
    const deltas: string[] = []
    const reasoning: string[] = []
    const usage: Record<string, unknown>[] = []
    const events: AiHostSseEvent[] = []

    const result = await transport.streamTurn({
      sessionId: 'session-1',
      scope,
      turn,
      systemPrompt: 'system',
      tools: [],
      messages: [{ role: 'user', content: 'hello' }],
      onDelta: (value) => deltas.push(value),
      onReasoning: (value) => reasoning.push(value),
      onUsage: (value) => usage.push(value),
      onSseEvent: (event) => events.push(event),
    })

    expect(result).toEqual({
      text: 'hello',
      reasoning: 'thinking',
      toolCalls: [{
        id: 'call-1',
        type: 'function',
        function: {
          name: 'setReason',
          arguments: '{}',
        },
      }],
    })
    expect(deltas).toEqual(['he'])
    expect(reasoning).toEqual(['thinking'])
    expect(usage).toEqual([{ totalTokens: 3 }])
    expect(events.map((event) => event.type)).toEqual(['delta', 'reasoning', 'usage', 'result'])
    expect(events[0]?.streamKey).toBe('pageDesign::page-a::llm::turn-1')

    expect(fetchClient).toHaveBeenCalledOnce()
    const [, init] = fetchClient.mock.calls[0] ?? []
    expect(init?.method).toBe('POST')
    expect(init?.body).toContain('"protocolVersion":3')
    expect(init?.body).toContain('"moduleId":"pageDesign"')
  })

  it('unwraps append-message API envelopes and validates session identity', async () => {
    const fetchClient = createFetch(async () => createJsonResponse({
      ok: true,
      data: {
        sessionId: 'session-1',
        turnId: 'turn-1',
      },
      error: null,
      requestId: 'request-1',
    }))
    const transport = new AiHostFetchTransport({ fetch: fetchClient })

    await expect(transport.appendMessages({
      sessionId: 'session-1',
      scope,
      turn,
      messages: [{ role: 'assistant', content: 'done' }],
    })).resolves.toBeUndefined()
  })
})
