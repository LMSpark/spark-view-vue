import { describe, expect, it, vi } from 'vitest'

import {
  AiHostFetchTransport,
  createAiHostAppSseEventHub,
  parseAiHostSseBlocks,
  subscribeAiHostAppSseEvents,
  type AiHostFetch,
  type AiHostSseEvent,
} from '../host/index'

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

function createV4SseEvent(event: string, data: unknown, terminal = false): string {
  return [
    `event: ${event}`,
    `data: ${JSON.stringify({
      protocolVersion: 4,
      ok: true,
      data,
      error: null,
      context: {
        requestId: 'request-1',
        session: { sessionId: 'session-1' },
        turn: {
          turnId: 'turn-1',
          turnKey,
          seq: 1,
          baseRevision: 0,
        },
        stream: {
          streamId: 'llm-stream',
          streamKey,
        },
        scope: {
          moduleId: 'demoRuntime',
          moduleInstanceId: 'business-a',
          instanceId: 'business-a',
        },
      },
      event: {
        transport: 'sse',
        name: event,
        terminal,
      },
    })}`,
    '',
    '',
  ].join('\n')
}

function createV4AppSseEvent(event: string, data: unknown): string {
  return [
    `event: ${event}`,
    `data: ${JSON.stringify({
      protocolVersion: 4,
      ok: true,
      data,
      error: null,
      context: {
        requestId: 'app-request-1',
      },
      event: {
        transport: 'sse',
        name: event,
        terminal: false,
      },
    })}`,
    '',
    '',
  ].join('\n')
}

function createV4SseError(code: string, message: string): string {
  return [
    'event: error',
    `data: ${JSON.stringify({
      protocolVersion: 4,
      ok: false,
      data: null,
      error: {
        code,
        message,
        category: 'stream',
        severity: 'error',
        retryPolicy: 'safe-retry',
      },
      context: {
        requestId: 'request-err',
        session: { sessionId: 'session-1' },
        turn: { turnId: 'turn-1', turnKey },
        stream: { streamId: 'llm-stream', streamKey },
      },
      event: {
        transport: 'sse',
        name: 'error',
        terminal: true,
      },
    })}`,
    '',
    '',
  ].join('\n')
}

function createOpenAiSseChunk(data: unknown): string {
  return [
    `data: ${JSON.stringify(data)}`,
    '',
    '',
  ].join('\n')
}

describe('AiHostFetchTransport', () => {
  it('parses complete SSE blocks and leaves partial data buffered', () => {
    const parsed = parseAiHostSseBlocks('event: delta\r\ndata: hello\r\n\r\nevent: result\r\ndata: {"ok":true}')

    expect(parsed.events).toEqual([{ event: 'delta', data: 'hello' }])
    expect(parsed.rest).toBe('event: result\ndata: {"ok":true}')
  })

  it('subscribes to APP common SSE events through the AI event API', async () => {
    const fetchClient = createFetch(async () => createStreamResponse([
      createV4AppSseEvent('page-config', { pageId: 'home' }),
      createV4AppSseEvent('notification', { title: 'Done', message: 'Build complete' }),
      createV4AppSseEvent('debug-route-result', { requestId: 'debug-1', status: 'success' }),
    ]))
    const events: Array<{ name: string, data: unknown, requestId?: string | undefined }> = []
    const hub = createAiHostAppSseEventHub()
    const stopNotification = hub.on('notification', (event) => {
      events.push({
        name: event.name,
        data: event.data,
        requestId: event.context?.requestId,
      })
    })
    const stopDebugRoute = hub.on('debug-route-result', (event) => {
      events.push({
        name: event.name,
        data: event.data,
        requestId: event.context?.requestId,
      })
    })

    const subscription = subscribeAiHostAppSseEvents({
      url: '/api/events',
      fetch: fetchClient,
      events: ['notification', 'debug-route-result'],
      headers: { Authorization: 'Bearer token' },
      onEvent: hub.emit,
    })

    await subscription.closed
    stopNotification()
    stopDebugRoute()

    expect(fetchClient).toHaveBeenCalledTimes(1)
    const init = fetchClient.mock.calls[0]?.[1]
    const headers = new Headers(init?.headers)
    expect(headers.get('Accept')).toBe('text/event-stream')
    expect(headers.get('Authorization')).toBe('Bearer token')
    expect(events).toEqual([
      {
        name: 'notification',
        data: { title: 'Done', message: 'Build complete' },
        requestId: 'app-request-1',
      },
      {
        name: 'debug-route-result',
        data: { requestId: 'debug-1', status: 'success' },
        requestId: 'app-request-1',
      },
    ])
  })

  it('streams an AI turn through package-owned SSE transport', async () => {
    const fetchClient = createFetch(async () => createStreamResponse([
      createV4SseEvent('delta', { delta: 'he' }),
      createV4SseEvent('reasoning', { reasoning: 'thinking' }),
      createV4SseEvent('usage', { usage: { totalTokens: 3 } }),
      createV4SseEvent('result', {
        text: 'hello',
        toolCalls: [{ id: 'call-1', type: 'function', function: { name: 'setReason', arguments: '{}' } }],
      }),
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
    expect(events[0]?.turnKey).toBe('demoRuntime::business-a::turn-1')
    expect(events[0]?.streamKey).toBe('demoRuntime::business-a::turn-1::llm-stream')

    expect(fetchClient).toHaveBeenCalledOnce()
    const [, init] = fetchClient.mock.calls[0] ?? []
    expect(init?.method).toBe('POST')
    const headers = init?.headers as Headers
    expect(headers.get('Accept')).toBe('text/event-stream')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(init?.body).toContain('"protocolVersion":4')
    expect(init?.body).toContain('"moduleId":"demoRuntime"')
    const body = JSON.parse(String(init?.body))
    expect(body).not.toHaveProperty('windowSize')
    expect(body.turn).toEqual({
      turnId: 'turn-1',
      turnKey,
      streamKey,
    })
  })

  it('accepts snake_case tool_calls in V4 result events', async () => {
    const fetchClient = createFetch(async () => createStreamResponse([
      createV4SseEvent('result', {
        text: '',
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'invokeAction', arguments: '{}' } }],
      }),
    ]))
    const transport = new AiHostFetchTransport({
      baseUrl: '/api/ai',
      fetch: fetchClient,
    })

    const result = await transport.streamTurn({
      sessionId: 'session-1',
      scope,
      turn,
      systemPrompt: 'system',
      tools: [],
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(result.toolCalls).toEqual([
      { id: 'call-1', type: 'function', function: { name: 'invokeAction', arguments: '{}' } },
    ])
  })

  it('assembles raw OpenAI SSE tool_calls when the backend only relays chunks', async () => {
    const fetchClient = createFetch(async () => createStreamResponse([
      createOpenAiSseChunk({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call-1',
              type: 'function',
              function: { name: 'invokeAction', arguments: '{"path":' },
            }],
          },
        }],
      }),
      createOpenAiSseChunk({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              function: { arguments: '"/pageDesign[page-1]","actionName":"countNodes","args":{}}' },
            }],
          },
        }],
      }),
    ]))
    const transport = new AiHostFetchTransport({
      baseUrl: '/api/ai',
      fetch: fetchClient,
    })

    const result = await transport.streamTurn({
      sessionId: 'session-1',
      scope,
      turn,
      systemPrompt: 'system',
      tools: [],
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(result.toolCalls).toEqual([
      {
        id: 'call-1',
        type: 'function',
        function: {
          name: 'invokeAction',
          arguments: '{"path":"/pageDesign[page-1]","actionName":"countNodes","args":{}}',
        },
      },
    ])
  })

  it('allows callers to override backend window size for long tool loops', async () => {
    const fetchClient = createFetch(async () => createStreamResponse([
      'event: result\ndata: {"sessionId":"session-1","turnId":"turn-1","text":"ok"}\n\n',
    ]))
    const transport = new AiHostFetchTransport({
      baseUrl: '/api/ai',
      fetch: fetchClient,
      windowSize: 80,
    })

    await transport.streamTurn({
      sessionId: 'session-1',
      scope,
      turn,
      systemPrompt: 'system',
      tools: [],
      messages: [{ role: 'user', content: 'hello' }],
    })

    const [, init] = fetchClient.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))['windowSize']).toBe(80)
  })

  it('reports SSE error envelopes through diagnostics before throwing', async () => {
    const fetchClient = createFetch(async () => createStreamResponse([
      createV4SseError('LLM_TOOL_CALL_FAILED', 'LLM tool-call request failed'),
    ]))
    const transport = new AiHostFetchTransport({
      baseUrl: '/api/ai',
      fetch: fetchClient,
    })
    const events: AiHostSseEvent[] = []

    await expect(transport.streamTurn({
      sessionId: 'session-1',
      scope,
      turn,
      systemPrompt: 'system',
      tools: [],
      messages: [{ role: 'user', content: 'hello' }],
      onSseEvent: (event) => events.push(event),
    })).rejects.toThrow('LLM tool-call request failed (code=LLM_TOOL_CALL_FAILED, requestId=request-err')

    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('error')
    expect(events[0]?.data).toContain('LLM_TOOL_CALL_FAILED')
  })

  it('unwraps append-message API envelopes and validates session identity', async () => {
    const fetchClient = createFetch(async () => createJsonResponse({
      protocolVersion: 4,
      ok: true,
      data: {
        sessionId: 'session-1',
        turnId: 'turn-1',
      },
      error: null,
      context: {
        requestId: 'request-1',
      },
      event: {
        transport: 'http',
        name: 'response',
        terminal: true,
      },
    }))
    const transport = new AiHostFetchTransport({ fetch: fetchClient })

    await expect(transport.appendMessages({
      sessionId: 'session-1',
      scope,
      turn,
      messages: [{ role: 'assistant', content: 'done' }],
    })).resolves.toBeUndefined()

    const [, init] = fetchClient.mock.calls[0] ?? []
    const headers = init?.headers as Headers
    expect(headers.get('Accept')).toBe('application/json')
    expect(headers.get('Content-Type')).toBe('application/json')
    const body = JSON.parse(String(init?.body))
    expect(body.turn).toEqual({
      turnId: 'turn-1',
      turnKey,
    })
    expect(body.turn).not.toHaveProperty('streamKey')
  })

  it('accepts V4 append-message identity from envelope context', async () => {
    const fetchClient = createFetch(async () => createJsonResponse({
      protocolVersion: 4,
      ok: true,
      data: {
        appended: 2,
      },
      error: null,
      context: {
        requestId: 'request-1',
        session: { sessionId: 'session-1' },
        turn: {
          turnId: 'turn-1',
          turnKey,
        },
      },
      event: {
        transport: 'http',
        name: 'response',
        terminal: true,
      },
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
