/**
 * APP 公共 SSE 事件订阅器。
 *
 * 这是 AI 侧接入 `/api/events` 的框架无关 API：浏览器和 Node MJS
 * 都可以通过 fetch 读取 APP 公共 SSE，并统一解包 v4 envelope。
 */

import {
  isApiEnvelope,
  isRecord,
  readApiEnvelopeContext,
  readApiEnvelopeEvent,
  resolveFetch,
  tryParseJson,
  unwrapApiEnvelope,
  type ApiEnvelopeContext,
  type ApiEnvelopeEvent,
} from './http-utils'
import {
  parseAiHostFinalSseBlock,
  parseAiHostSseBlocks,
} from './sse-parser'
import type {
  AiHostFetch,
  AiHostHeadersProvider,
} from './transport-types'

export type AiHostAppSseEventName =
  | 'page-config'
  | 'data-batch-job'
  | 'data-change'
  | 'notification'
  | 'debug-route-request'
  | 'debug-route-result'
  | 'debug-screenshot-request'
  | 'debug-screenshot-result'
  | 'debug-fc-error-report'
  | (string & {})

export type AiHostAppSseEvent<T = unknown> = Readonly<{
  name: AiHostAppSseEventName
  data: T
  rawData: string
  rawPayload: unknown
  protocolVersion?: number | undefined
  context?: ApiEnvelopeContext | undefined
  event?: ApiEnvelopeEvent | undefined
  legacy: boolean
}>

export type AiHostAppSseListener<T = unknown> = (event: AiHostAppSseEvent<T>) => void

export type AiHostAppSseEventHub = Readonly<{
  on<T = unknown>(name: AiHostAppSseEventName, listener: AiHostAppSseListener<T>): () => void
  onAny(listener: AiHostAppSseListener): () => void
  emit(event: AiHostAppSseEvent): void
}>

export type AiHostAppSseSubscribeOptions<T = unknown> = Readonly<{
  url?: string | undefined
  fetch?: AiHostFetch | undefined
  headers?: HeadersInit | undefined
  getHeaders?: AiHostHeadersProvider | undefined
  events?: readonly AiHostAppSseEventName[] | undefined
  signal?: AbortSignal | undefined
  onEvent: (event: AiHostAppSseEvent<T>) => void
  onError?: ((error: unknown) => void) | undefined
}>

export type AiHostAppSseSubscription = Readonly<{
  close(): void
  opened: Promise<void>
  closed: Promise<void>
}>

const DEFAULT_APP_EVENTS_URL = '/api/events'

export function createAiHostAppSseEventHub(): AiHostAppSseEventHub {
  const listeners = new Map<string, Set<AiHostAppSseListener>>()
  const anyListeners = new Set<AiHostAppSseListener>()

  return {
    on<T = unknown>(name: AiHostAppSseEventName, listener: AiHostAppSseListener<T>) {
      let set = listeners.get(name)
      if (set === undefined) {
        set = new Set()
        listeners.set(name, set)
      }
      set.add(listener as AiHostAppSseListener)
      return () => {
        set.delete(listener as AiHostAppSseListener)
        if (set.size === 0) listeners.delete(name)
      }
    },
    onAny(listener) {
      anyListeners.add(listener)
      return () => {
        anyListeners.delete(listener)
      }
    },
    emit(event) {
      for (const listener of anyListeners) {
        listener(event)
      }
      const set = listeners.get(event.name)
      if (set === undefined) return
      for (const listener of set) {
        listener(event)
      }
    },
  }
}

export function subscribeAiHostAppSseEvents<T = unknown>(
  options: AiHostAppSseSubscribeOptions<T>,
): AiHostAppSseSubscription {
  const controller = new AbortController()
  const externalSignal = options.signal
  let closedByCaller = false
  let resolveOpened!: () => void
  let rejectOpened!: (error: unknown) => void
  const opened = new Promise<void>((resolve, reject) => {
    resolveOpened = resolve
    rejectOpened = reject
  })

  const abortFromExternal = () => controller.abort(externalSignal?.reason)
  if (externalSignal?.aborted === true) {
    abortFromExternal()
  } else {
    externalSignal?.addEventListener('abort', abortFromExternal, { once: true })
  }

  const closed = runAppSseSubscription(options, controller.signal, () => closedByCaller, resolveOpened)
    .catch((error: unknown) => {
      if (closedByCaller || isAbortError(error)) return
      rejectOpened(error)
      if (typeof options.onError === 'function') {
        options.onError(error)
        return
      }
      throw error
    })
    .finally(() => {
      externalSignal?.removeEventListener('abort', abortFromExternal)
    })

  return {
    close() {
      closedByCaller = true
      controller.abort()
    },
    opened,
    closed,
  }
}

async function runAppSseSubscription<T>(
  options: AiHostAppSseSubscribeOptions<T>,
  signal: AbortSignal,
  isClosedByCaller: () => boolean,
  markOpened: () => void,
): Promise<void> {
  const fetchClient = resolveFetch(options.fetch)
  const response = await fetchClient(options.url ?? DEFAULT_APP_EVENTS_URL, {
    method: 'GET',
    headers: await buildHeaders(options),
    signal,
  })
  if (!response.ok || !response.body) {
    throw new Error(`APP SSE subscribe failed: HTTP ${response.status}`)
  }
  markOpened()

  const allowedEvents = options.events === undefined
    ? null
    : new Set<string>(options.events)
  const decoder = new TextDecoder()
  let buffer = ''

  await readStreamBody(response.body, (chunk) => {
    buffer += decoder.decode(chunk, { stream: true })
    const parsed = parseAiHostSseBlocks(buffer)
    buffer = parsed.rest
    for (const event of parsed.events) {
      if (allowedEvents !== null && !allowedEvents.has(event.event)) continue
      options.onEvent(normalizeAppSseEvent<T>(event.event, event.data))
    }
  })

  if (isClosedByCaller()) return
  buffer += decoder.decode()
  for (const event of parseAiHostFinalSseBlock(buffer)) {
    if (allowedEvents !== null && !allowedEvents.has(event.event)) continue
    options.onEvent(normalizeAppSseEvent<T>(event.event, event.data))
  }
}

async function buildHeaders(options: Readonly<{
  headers?: HeadersInit | undefined
  getHeaders?: AiHostHeadersProvider | undefined
}>): Promise<Headers> {
  const headers = new Headers()
  copyHeaders(headers, options.headers)
  if (options.getHeaders !== undefined) {
    copyHeaders(headers, await options.getHeaders())
  }
  headers.set('Accept', 'text/event-stream')
  return headers
}

function copyHeaders(target: Headers, source: HeadersInit | undefined): void {
  if (source === undefined) return
  new Headers(source).forEach((value, key) => {
    target.set(key, value)
  })
}

function normalizeAppSseEvent<T>(name: string, rawData: string): AiHostAppSseEvent<T> {
  const rawPayload = tryParseJson(rawData)
  const context = readApiEnvelopeContext(rawPayload)
  const envelopeEvent = readApiEnvelopeEvent(rawPayload)
  const protocolVersion = isRecord(rawPayload) && typeof rawPayload['protocolVersion'] === 'number'
    ? rawPayload['protocolVersion']
    : undefined
  validateEnvelopeName(name, envelopeEvent)
  const data = unwrapApiEnvelope(rawPayload) as T
  return {
    name,
    data,
    rawData,
    rawPayload,
    ...(protocolVersion === undefined ? {} : { protocolVersion }),
    ...(context === undefined ? {} : { context }),
    ...(envelopeEvent === undefined ? {} : { event: envelopeEvent }),
    legacy: !isApiEnvelope(rawPayload) || protocolVersion !== 4,
  }
}

function validateEnvelopeName(name: string, envelopeEvent: ApiEnvelopeEvent | undefined): void {
  if (envelopeEvent?.transport !== undefined && envelopeEvent.transport !== 'sse') {
    throw new Error(`APP SSE event ${name} has invalid envelope transport: ${envelopeEvent.transport}`)
  }
  if (envelopeEvent?.name !== undefined && envelopeEvent.name !== name) {
    throw new Error(`APP SSE event name mismatch: frame=${name}, envelope=${envelopeEvent.name}`)
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
