#!/usr/bin/env node

const baseUrl = process.env.AI_BACKEND_URL?.replace(/\/+$/, '') || 'http://localhost:8080'
const tenantId = process.env.AI_TENANT_ID || 'lmspark'
const projectId = process.env.AI_PROJECT_ID || ''
const username = process.env.AI_USERNAME || 'admin'
const password = process.env.AI_PASSWORD || 'admin123'

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

  const payload = await response.json()
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
  const response = await fetch(`${baseUrl}/api/ai/sessions`, {
    method: 'POST',
    headers: buildScopedHeaders(token),
    body: JSON.stringify({
      protocolVersion: 3,
      systemPrompt: 'You are a concise assistant.',
      userPrompt: 'Reply with ok only, no tools.',
      windowSize: 8,
      mode: 'stills',
      tools: null,
    }),
  })

  if (!response.ok) {
    throw new Error(`create session failed: ${response.status} ${await response.text()}`)
  }

  const payload = await response.json()
  if (typeof payload?.sessionId !== 'string' || payload.sessionId === '') {
    throw new Error('create session failed: missing sessionId')
  }
  return {
    sessionId: payload.sessionId,
    protocolVersion: payload.protocolVersion,
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

async function streamTurn(token, sessionId) {
  const response = await fetch(`${baseUrl}/api/ai/sessions/${sessionId}/turn/stream`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Tenant-Id': tenantId,
      'Accept': 'text/event-stream',
      ...(projectId ? { 'X-Project-Id': projectId } : {}),
    },
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

        if (record.event === 'result') {
          sawResult = true
          try {
            resultPayload = JSON.parse(record.data)
          } catch {
            resultPayload = { text: record.data }
          }
        }

        if (record.event === 'error') {
          sawError = true
          errorPayload = record.data
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
    records: records.slice(0, 12),
  }
}

async function main() {
  const token = await login()
  const created = await createSession(token)
  const { sessionId } = created

  try {
    const result = await streamTurn(token, sessionId)
    const output = {
      sessionId,
      createProtocolVersion: created.protocolVersion,
      createProtocolOk: created.protocolVersion === 3,
      ...result,
      ok: created.protocolVersion === 3 && result.protocolOk && result.semanticOk,
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
