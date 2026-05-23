#!/usr/bin/env node

import { randomUUID } from 'node:crypto'

const baseUrl = process.env.AI_BACKEND_URL?.replace(/\/+$/, '') || 'http://localhost:8080'
const tenantId = process.env.AI_TENANT_ID || 'lmspark'
const projectId = process.env.AI_PROJECT_ID || ''
const username = process.env.AI_USERNAME || 'admin'
const password = process.env.AI_PASSWORD || 'admin123'
const smokeModuleId = 'spark-ai-smoke'

function unwrapEnvelope(payload) {
  if (!payload || typeof payload !== 'object' || typeof payload.ok !== 'boolean') return payload
  if (payload.ok) return payload.data
  const message = payload.error?.message || payload.error?.code || 'API request failed'
  throw new Error(message)
}

function buildScopedHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-Tenant-Id': tenantId,
    ...(projectId ? { 'X-Project-Id': projectId } : {}),
  }
}

async function login() {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': tenantId,
      ...(projectId ? { 'X-Project-Id': projectId } : {}),
    },
    body: JSON.stringify({ tenantId, username, password }),
  })

  if (!response.ok) {
    throw new Error(`login failed: ${response.status} ${await response.text()}`)
  }

  const payload = unwrapEnvelope(await response.json())
  if (!payload?.success || typeof payload.token !== 'string' || payload.token === '') {
    throw new Error('login failed: missing token')
  }
  return payload.token
}

function flushEvent(state, records) {
  if (!state.event || state.data.length === 0) return null
  const record = {
    event: state.event,
    data: state.data.join('\n'),
  }
  records.push(record)
  state.event = 'message'
  state.data = []
  return record
}

async function createSession(token) {
  const requestedSessionId = `smoke-session-${randomUUID()}`
  const scope = {
    moduleId: smokeModuleId,
    moduleInstanceId: requestedSessionId,
    instanceId: requestedSessionId,
  }
  const response = await fetch(`${baseUrl}/api/ai/sessions`, {
    method: 'POST',
    headers: buildScopedHeaders(token),
    body: JSON.stringify({
      protocolVersion: 4,
      sessionId: requestedSessionId,
      reuseScopeSession: false,
      systemPrompt: 'You are a concise assistant.',
      userPrompt: 'Reply with ok only, no tools.',
      windowSize: 8,
      mode: 'stills',
      scope,
      tools: null,
    }),
  })

  if (!response.ok) {
    throw new Error(`create session failed: ${response.status} ${await response.text()}`)
  }

  const payload = unwrapEnvelope(await response.json())
  if (typeof payload?.sessionId !== 'string' || payload.sessionId === '') {
    throw new Error('create session failed: missing sessionId')
  }
  if (payload.sessionId !== requestedSessionId) {
    throw new Error(`create session returned unexpected sessionId: ${payload.sessionId}`)
  }
  return {
    sessionId: payload.sessionId,
    protocolVersion: payload.protocolVersion,
    scope,
  }
}

async function destroySession(token, sessionId) {
  await fetch(`${baseUrl}/api/ai/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Tenant-Id': tenantId,
      ...(projectId ? { 'X-Project-Id': projectId } : {}),
    },
  }).catch(() => undefined)
}

function parseSseRecordData(record) {
  try {
    return JSON.parse(record.data)
  } catch (error) {
    throw new Error(`SSE ${record.event} data is not JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function assertV4SseEnvelope(record, expected) {
  const payload = parseSseRecordData(record)
  if (!payload || typeof payload !== 'object') {
    throw new Error(`SSE ${record.event} data is not an object`)
  }
  if (payload.protocolVersion !== 4) {
    throw new Error(`SSE ${record.event} protocolVersion expected 4, got ${payload.protocolVersion}`)
  }
  if (payload.event?.transport !== 'sse') {
    throw new Error(`SSE ${record.event} envelope event.transport mismatch`)
  }
  if (payload.event?.name !== record.event) {
    throw new Error(`SSE event name mismatch: frame=${record.event}, envelope=${payload.event?.name}`)
  }
  if (typeof payload.ok !== 'boolean') {
    throw new Error(`SSE ${record.event} envelope missing ok boolean`)
  }
  if (!payload.context || typeof payload.context !== 'object') {
    throw new Error(`SSE ${record.event} envelope missing context`)
  }
  if (typeof payload.context.requestId !== 'string' || payload.context.requestId === '') {
    throw new Error(`SSE ${record.event} envelope missing context.requestId`)
  }
  if (payload.context.session?.sessionId !== expected.sessionId) {
    throw new Error(`SSE ${record.event} sessionId mismatch`)
  }
  if (payload.context.turn?.turnId !== expected.turnId) {
    throw new Error(`SSE ${record.event} turnId mismatch`)
  }
  if (payload.context.stream?.streamKey !== expected.streamKey) {
    throw new Error(`SSE ${record.event} streamKey mismatch`)
  }
  if (record.event === 'done' && payload.event?.terminal !== true) {
    throw new Error('SSE done envelope must be terminal')
  }
  if (record.event !== 'done' && record.event !== 'error' && payload.event?.terminal !== false) {
    throw new Error(`SSE ${record.event} envelope must be non-terminal`)
  }
  return payload
}

async function streamTurn(token, created) {
  const { sessionId, scope } = created
  const turnId = `smoke-turn-${randomUUID()}`
  const turnKey = `${scope.moduleId}::${scope.moduleInstanceId}::${turnId}`
  const streamKey = `${turnKey}::llm-stream`
  const response = await fetch(`${baseUrl}/api/ai/sessions/${sessionId}/turn/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Tenant-Id': tenantId,
      'Accept': 'text/event-stream',
      ...(projectId ? { 'X-Project-Id': projectId } : {}),
    },
    body: JSON.stringify({
      protocolVersion: 4,
      scope,
      turn: {
        turnId,
        turnKey,
        streamKey,
      },
      messages: [],
    }),
  })

  if (!response.ok || !response.body) {
    throw new Error(`turn stream failed: ${response.status} ${await response.text()}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const state = { event: 'message', data: [] }
  const records = []

  let sawResult = false
  let sawDone = false
  let sawError = false
  let resultPayload = null
  let errorPayload = ''
  const eventOrder = []
  const envelopeChecks = []
  const expectedContext = { sessionId, turnId, streamKey }

  outer: for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line === '') {
        const record = flushEvent(state, records)
        if (!record) continue
        eventOrder.push(record.event)
        const envelope = assertV4SseEnvelope(record, expectedContext)
        envelopeChecks.push({
          event: record.event,
          ok: envelope.ok,
          terminal: envelope.event.terminal,
          requestId: envelope.context.requestId,
        })

        if (record.event === 'result') {
          sawResult = true
          resultPayload = unwrapEnvelope(envelope)
        }

        if (record.event === 'error') {
          sawError = true
          errorPayload = envelope.error?.message || envelope.error?.code || record.data
        }

        if (record.event === 'done') {
          sawDone = true
          break outer
        }
        continue
      }

      if (line.startsWith('event:')) {
        state.event = line.slice(6).trim() || 'message'
        continue
      }

      if (line.startsWith('data:')) {
        state.data.push(line.slice(5).trim())
      }
    }
  }

  flushEvent(state, records)

  return {
    turnId,
    streamKey,
    protocolChecks: {
      sawResult,
      sawDone,
      sawError,
      resultBeforeDone:
        eventOrder.indexOf('result') !== -1
        && eventOrder.indexOf('done') !== -1
        && eventOrder.indexOf('result') < eventOrder.indexOf('done'),
    },
    protocolOk:
      sawResult
      && sawDone
      && !sawError
      && eventOrder.indexOf('result') !== -1
      && eventOrder.indexOf('done') !== -1
      && eventOrder.indexOf('result') < eventOrder.indexOf('done'),
    semanticOk: typeof resultPayload?.text === 'string' && resultPayload.text.length > 0,
    sawResult,
    sawDone,
    sawError,
    errorPayload,
    resultPayload,
    eventOrder,
    envelopeChecks,
    records: records.slice(0, 12),
  }
}

async function main() {
  const token = await login()
  const created = await createSession(token)
  const { sessionId } = created

  try {
    const result = await streamTurn(token, created)
    const output = {
      sessionId,
      createProtocolVersion: created.protocolVersion,
      createProtocolOk: created.protocolVersion === 4,
      ...result,
      ok: created.protocolVersion === 4 && result.protocolOk && result.semanticOk,
    }
    console.log(JSON.stringify(output, null, 2))

    if (!output.ok) {
      process.exit(2)
    }
  } finally {
    await destroySession(token, sessionId)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
