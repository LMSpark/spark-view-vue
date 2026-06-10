import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class MockEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  static instances: MockEventSource[] = []

  readonly url: string
  readyState = MockEventSource.CONNECTING
  onerror: (() => void) | null = null
  private readonly listeners = new Map<string, Set<EventListener>>()

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: EventListener): void {
    let listeners = this.listeners.get(type)
    if (listeners === undefined) {
      listeners = new Set()
      this.listeners.set(type, listeners)
    }
    listeners.add(listener)
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener)
  }

  open(): void {
    this.readyState = MockEventSource.OPEN
    this.dispatch('open', new Event('open'))
  }

  emit(type: string, data: string): void {
    this.dispatch(type, new MessageEvent(type, { data }))
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED
  }

  private dispatch(type: string, event: Event): void {
    const listeners = this.listeners.get(type)
    if (listeners === undefined) return
    for (const listener of listeners) listener(event)
  }
}

describe('waitForAppSseConnection', () => {
  let stopHostRunSubscription: (() => void) | undefined

  beforeEach(() => {
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
  })

  afterEach(() => {
    stopHostRunSubscription?.()
    stopHostRunSubscription = undefined
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('resolves immediately when APP SSE is already open', async () => {
    const sse = await import('@/services/sse-events')
    stopHostRunSubscription = sse.onAiHostRunRequest(() => undefined)
    MockEventSource.instances[0]?.open()

    await expect(sse.waitForAppSseConnection()).resolves.toBeUndefined()
  })

  it('waits until APP SSE connection opens', async () => {
    const sse = await import('@/services/sse-events')
    stopHostRunSubscription = sse.onAiHostRunRequest(() => undefined)
    const pending = sse.waitForAppSseConnection(1_000)
    const source = MockEventSource.instances[0]
    expect(source?.url).toBe('/api/events')
    source?.open()

    await expect(pending).resolves.toBeUndefined()
  })

  it('recreates a closed APP SSE connection before waiting', async () => {
    const sse = await import('@/services/sse-events')
    stopHostRunSubscription = sse.onAiHostRunRequest(() => undefined)
    const closedSource = MockEventSource.instances[0]
    closedSource?.close()

    const pending = sse.waitForAppSseConnection(1_000)
    expect(MockEventSource.instances).toHaveLength(2)
    const nextSource = MockEventSource.instances[1]
    nextSource?.open()

    await expect(pending).resolves.toBeUndefined()
  })

  it('unwraps v4 success envelopes that only include ok and data', async () => {
    const sse = await import('@/services/sse-events')
    const callback = vi.fn()
    stopHostRunSubscription = sse.onAiHostRunRequest(callback)
    const source = MockEventSource.instances[0]
    source?.open()

    source?.emit('ai-host-run-request', JSON.stringify({
      protocolVersion: 4,
      ok: true,
      data: {
        requestId: 'hr-sse-envelope',
        alias: 'projectPlanning',
        args: { projectId: 'hr-enterprise-planning-smoke' },
      },
      context: { requestId: 'server-event-1' },
      event: { transport: 'sse', name: 'ai-host-run-request' },
    }))

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'hr-sse-envelope',
      alias: 'projectPlanning',
      args: { projectId: 'hr-enterprise-planning-smoke' },
    }))
  })
})
