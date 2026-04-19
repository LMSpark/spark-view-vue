#!/usr/bin/env node

const baseUrl = process.env.AI_BACKEND_URL?.replace(/\/+$/, '') || 'http://localhost:8080'
const tenantId = process.env.AI_TENANT_ID || 'lmspark'
const username = process.env.AI_USERNAME || 'admin'
const password = process.env.AI_PASSWORD || 'admin123'

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

async function main() {
  const token = await login()
  const response = await fetch(`${baseUrl}/api/ai/chat/stream-page`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Tenant-Id': tenantId,
    },
    body: JSON.stringify({
      action: 'generate',
      pageId: `smoke-page-${Date.now()}`,
      prompt: '生成一个最小页面，只需要一个标题和一个按钮。返回合法的页面配置 JSON。',
    }),
  })

  if (!response.ok || !response.body) {
    throw new Error(`stream-page failed: ${response.status} ${await response.text()}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const state = { event: 'message', data: [] }
  const records = []
  let sawResult = false
  let sawDone = false
  let sawError = false
  let phaseCount = 0

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
        if (record.event === 'phase') phaseCount += 1
        if (record.event === 'result') sawResult = true
        if (record.event === 'error') sawError = true
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

  const result = {
    ok: sawResult && sawDone && !sawError,
    sawResult,
    sawDone,
    sawError,
    phaseCount,
    records: records.slice(0, 12),
  }

  console.log(JSON.stringify(result, null, 2))

  if (!result.ok) {
    process.exit(2)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})