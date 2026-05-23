#!/usr/bin/env node

const baseUrl = process.env.AI_BACKEND_URL?.replace(/\/+$/, '') || 'http://localhost:8080'
const tenantId = process.env.AI_TENANT_ID || 'lmspark'
const username = process.env.AI_USERNAME || 'admin'
const password = process.env.AI_PASSWORD || 'admin123'

function unwrapEnvelope(payload) {
  if (!payload || typeof payload !== 'object' || typeof payload.ok !== 'boolean') return payload
  if (payload.ok) return payload.data
  const message = payload.error?.message || payload.error?.code || 'API request failed'
  throw new Error(message)
}

async function login() {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': tenantId,
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

async function main() {
  const token = await login()
  const response = await fetch(`${baseUrl}/api/ai/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Tenant-Id': tenantId,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Reply with ok only.' }],
      mode: 'single',
    }),
  })

  if (!response.ok || !response.body) {
    throw new Error(`stream failed: ${response.status} ${await response.text()}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const state = { event: 'message', data: [] }
  const records = []
  let sawDelta = false
  let sawDone = false

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
        if (record.event === 'delta') sawDelta = true
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

  console.log(JSON.stringify({
    ok: sawDelta || sawDone,
    sawDelta,
    sawDone,
    records: records.slice(0, 8),
  }, null, 2))

  if (!(sawDelta || sawDone)) {
    process.exit(2)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
