export function createAppSseEventHub() {
  const listeners = new Map()
  const anyListeners = new Set()

  return {
    on(name, listener) {
      let set = listeners.get(name)
      if (set === undefined) {
        set = new Set()
        listeners.set(name, set)
      }
      set.add(listener)
      return () => {
        set.delete(listener)
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
      for (const listener of anyListeners) listener(event)
      const set = listeners.get(event.name)
      if (set === undefined) return
      for (const listener of set) listener(event)
    },
  }
}

export function subscribeAppSseEvents(options) {
  const controller = new AbortController()
  const externalSignal = options.signal
  let closedByCaller = false
  let resolveOpened
  let rejectOpened
  const opened = new Promise((resolve, reject) => {
    resolveOpened = resolve
    rejectOpened = reject
  })

  const abortFromExternal = () => controller.abort(externalSignal?.reason)
  if (externalSignal?.aborted === true) {
    abortFromExternal()
  } else {
    externalSignal?.addEventListener('abort', abortFromExternal, { once: true })
  }

  const closed = runAppSseSubscription(options, {
    signal: controller.signal,
    isClosedByCaller: () => closedByCaller,
    markOpened: resolveOpened,
  })
    .catch((error) => {
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

async function runAppSseSubscription(options, runtime) {
  const response = await fetch(options.url, {
    method: 'GET',
    headers: await buildHeaders(options),
    signal: runtime.signal,
  })
  if (!response.ok || !response.body) {
    throw new Error(`APP SSE subscribe failed: HTTP ${response.status}`)
  }
  if (typeof options.onOpen === 'function') {
    options.onOpen(response)
  }
  runtime.markOpened()

  const allowedEvents = options.events === undefined
    ? null
    : new Set(options.events)
  const decoder = new TextDecoder()
  let buffer = ''
  const reader = response.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      buffer = dispatchCompleteSseBlocks(buffer, allowedEvents, options.onEvent)
    }
  } finally {
    reader.releaseLock()
  }

  if (runtime.isClosedByCaller()) return
  buffer += decoder.decode()
  dispatchFinalSseBlock(buffer, allowedEvents, options.onEvent)
}

async function buildHeaders(options) {
  const headers = new Headers(options.headers ?? {})
  if (typeof options.getHeaders === 'function') {
    new Headers(await options.getHeaders()).forEach((value, key) => {
      headers.set(key, value)
    })
  }
  headers.set('Accept', 'text/event-stream')
  return headers
}

function dispatchCompleteSseBlocks(buffer, allowedEvents, onEvent) {
  const parts = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n\n')
  const rest = parts.pop() ?? ''
  for (const part of parts) dispatchSseBlock(part, allowedEvents, onEvent)
  return rest
}

function dispatchFinalSseBlock(buffer, allowedEvents, onEvent) {
  const normalized = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (normalized.length === 0) return
  dispatchSseBlock(normalized, allowedEvents, onEvent)
}

function dispatchSseBlock(block, allowedEvents, onEvent) {
  const parsed = parseSseBlock(block)
  if (parsed === null) return
  if (allowedEvents !== null && !allowedEvents.has(parsed.event)) return
  onEvent(normalizeAppSseEvent(parsed.event, parsed.data))
}

function parseSseBlock(block) {
  let event = 'message'
  const dataLines = []
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon < 0 ? line : line.slice(0, colon)
    let value = colon < 0 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    if (field === 'data') dataLines.push(value)
  }
  if (dataLines.length === 0) return null
  return { event, data: dataLines.join('\n') }
}

function normalizeAppSseEvent(name, rawData) {
  const rawPayload = tryParseJson(rawData)
  if (!isRecord(rawPayload) || typeof rawPayload.ok !== 'boolean') {
    return {
      name,
      ok: true,
      data: rawPayload,
      rawData,
      rawPayload,
    }
  }
  validateEnvelopeName(name, rawPayload.event)
  const protocolVersion = typeof rawPayload.protocolVersion === 'number'
    ? rawPayload.protocolVersion
    : undefined
  return {
    name,
    ok: rawPayload.ok,
    data: rawPayload.ok ? rawPayload.data : (rawPayload.error ?? rawPayload),
    rawData,
    rawPayload,
    ...(protocolVersion === undefined ? {} : { protocolVersion }),
    ...(isRecord(rawPayload.context) ? { context: rawPayload.context } : {}),
    ...(isRecord(rawPayload.event) ? { event: rawPayload.event } : {}),
  }
}

function validateEnvelopeName(name, event) {
  if (!isRecord(event)) return
  if (event.transport !== undefined && event.transport !== 'sse') {
    throw new Error(`APP SSE event ${name} has invalid envelope transport: ${event.transport}`)
  }
  if (event.name !== undefined && event.name !== name) {
    throw new Error(`APP SSE event name mismatch: frame=${name}, envelope=${event.name}`)
  }
}

function tryParseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isAbortError(error) {
  return (
    error instanceof DOMException && error.name === 'AbortError'
  ) || (
    error instanceof Error && error.name === 'AbortError'
  )
}
