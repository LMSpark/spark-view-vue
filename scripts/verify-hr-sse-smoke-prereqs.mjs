#!/usr/bin/env node
/**
 * 验证 HR projectPlanning SSE smoke 前置条件与关键怀疑点。
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { subscribeAppSseEvents } from './app-sse-client.mjs'

const APP_URL = (process.env.SPARK_APP_URL ?? 'http://localhost:5273').replace(/\/+$/, '')
const TENANT_ID = 'lmspark'
const PROJECT_ID = 'hr-enterprise-planning-smoke'

const findings = []

async function main() {
  await checkOpenAiEnv()
  const auth = await login()
  await checkProjectExists(auth)
  await checkSseConnects()
  await checkHostRunWithoutBrowser(auth)
  await checkAiTurnStreamsLlmFrame(auth)
  report()
}

async function checkOpenAiEnv() {
  const envJava = await readEnvJava()
  const key = process.env.OPENAI_API_KEY ?? envJava.OPENAI_API_KEY
  const hasKey = typeof key === 'string' && key.length > 0 && !key.includes('your-api-key')
  addFinding(hasKey ? 'pass' : 'fail', 'LLM API key', hasKey
    ? `present in ${process.env.OPENAI_API_KEY ? 'process env' : '.env.java'}`
    : 'missing or placeholder')
  addFinding('info', 'LLM base URL', process.env.OPENAI_BASE_URL ?? envJava.OPENAI_BASE_URL ?? '(default)')
}

async function login() {
  const response = await fetch(`${APP_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: TENANT_ID, username: 'admin', password: 'admin123' }),
  })
  const body = await readJson(response)
  if (!response.ok || body?.ok !== true || typeof body?.data?.token !== 'string') {
    throw new Error(`login failed: ${response.status} ${JSON.stringify(body)}`)
  }
  addFinding('pass', 'auth login', `tenant=${body.data.tenantId ?? TENANT_ID}`)
  return {
    token: body.data.token,
    tenantId: body.data.tenantId ?? TENANT_ID,
    projectId: PROJECT_ID,
  }
}

async function checkProjectExists(auth) {
  const response = await fetch(`${APP_URL}/api/tenants/${TENANT_ID}/projects/${PROJECT_ID}`, {
    headers: authHeaders(auth),
  })
  const body = await readJson(response)
  if (response.ok && body?.ok === true) {
    addFinding('pass', 'project exists', PROJECT_ID)
    return
  }
  const message = body?.error?.message ?? `HTTP ${response.status}`
  if (response.status === 400 && String(message).includes('不存在')) {
    addFinding('fail', 'project lookup', `HTTP 400 ${message} (ensureProject must treat as missing)`)
    return
  }
  addFinding('fail', 'project lookup', message)
}

async function checkSseConnects() {
  const sub = subscribeAppSseEvents({
    url: `${APP_URL}/api/events`,
    events: ['ai-host-run-result'],
    onEvent: () => undefined,
  })
  try {
    await withTimeout(sub.opened, 10_000, 'SSE open timeout')
    addFinding('pass', 'node SSE /api/events', 'subscription opened')
  } finally {
    sub.close()
  }
}

async function checkHostRunWithoutBrowser(auth) {
  const response = await fetch(`${APP_URL}/api/ai/host-run/request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(auth),
    },
    body: JSON.stringify({
      requestId: `prereq-no-browser-${Date.now()}`,
      alias: 'projectPlanning',
      args: {
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        requirement: 'prereq probe',
        saveNavigationAfterRun: false,
      },
      timeoutMs: 30_000,
    }),
  })
  const body = await readJson(response)
  const code = body?.error?.code
  if (response.status === 409 && code === 'APP_SSE_NOT_CONNECTED') {
    addFinding('pass', 'host-run without browser SSE', 'APP_SSE_NOT_CONNECTED (expected for Node-only caller)')
    return
  }
  if (response.status === 400 && (code === 'MISSING_REQUIRED_FIELD' || String(body?.error?.message ?? '').includes('appClientId'))) {
    addFinding('pass', 'host-run without browser SSE', 'appClientId required (expected without browser SSE cookie)')
    return
  }
  addFinding('fail', 'host-run without browser SSE', `${response.status} ${JSON.stringify(body?.error ?? body?.data ?? body)}`)
}

async function checkAiTurnStreamsLlmFrame(auth) {
  const sessionId = `prereq-session-${Date.now()}`
  const turnId = `prereq-turn-${Date.now()}`
  let appClientCookie = ''
  let frameCount = 0
  let turnError = null
  let turnDone = false

  const sub = subscribeAppSseEvents({
    url: `${APP_URL}/api/events`,
    events: ['llm-frame', 'ai-turn-error', 'ai-turn-done'],
    onOpen: (response) => {
      appClientCookie = appClientCookieFromResponse(response)
    },
    onEvent: (event) => {
      const data = event.data
      if (event.name === 'llm-frame' && matchesTurn(data, sessionId, turnId)) frameCount += 1
      if (event.name === 'ai-turn-error' && matchesTurn(data, sessionId, turnId)) {
        turnError = JSON.stringify(data)
      }
      if ((event.name === 'ai-turn-done' || event.name === 'llm-frame') && matchesTurn(data, sessionId, turnId)) {
        const frameType = isRecord(data) ? data.type ?? data.frame?.type : undefined
        if (frameType === 'done' || event.name === 'ai-turn-done') turnDone = true
      }
    },
  })

  try {
    await withTimeout(sub.opened, 10_000, 'SSE open timeout for turn probe')
    if (appClientCookie.length === 0) {
      addFinding('fail', 'APP SSE cookie', 'SPARK_APP_CLIENT_ID cookie missing from /api/events response')
      return
    }

    const createResponse = await fetch(`${APP_URL}/api/ai/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: appClientCookie,
        ...authHeaders(auth),
      },
      body: JSON.stringify({
        protocolVersion: 4,
        sessionId,
        systemPrompt: 'Reply with one short sentence.',
        messages: [],
        tools: [],
        mode: 'function',
        scope: {
          businessRegistrationId: 'projectPlanning',
          businessInstanceId: `${TENANT_ID}:${PROJECT_ID}`,
        },
        reuseScopeSession: false,
      }),
    })
    const createBody = await readJson(createResponse)
    if (!createResponse.ok || createBody?.ok !== true) {
      addFinding('fail', 'AI session create', `${createResponse.status} ${JSON.stringify(createBody?.error ?? createBody)}`)
      return
    }
    addFinding('pass', 'AI session create', sessionId)

    const turnResponse = await fetch(`${APP_URL}/api/ai/turns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: appClientCookie,
        ...authHeaders(auth),
      },
      body: JSON.stringify({
        sessionId,
        turnId,
        messages: [{ role: 'user', content: 'Say hello in three words.' }],
        systemPrompt: 'Reply briefly.',
      }),
    })
    const turnBody = await readJson(turnResponse)
    if (!turnResponse.ok || turnBody?.data?.accepted !== true) {
      addFinding('fail', 'AI turn start', `${turnResponse.status} ${JSON.stringify(turnBody?.error ?? turnBody)}`)
      return
    }
    addFinding('pass', 'AI turn start', turnId)

    await waitUntil(() => turnDone || turnError !== null || frameCount > 0, 120_000, 'llm-frame wait')
    if (turnError !== null) {
      addFinding('fail', 'LLM SSE frames', turnError)
      return
    }
    if (frameCount === 0) {
      addFinding('fail', 'LLM SSE frames', 'no llm-frame within 120s — Java process may lack OPENAI_API_KEY from .env.java')
      return
    }
    addFinding('pass', 'LLM SSE frames', `received ${frameCount} llm-frame(s)`)
  } finally {
    sub.close()
  }
}

function authHeaders(auth) {
  return {
    Authorization: `Bearer ${auth.token}`,
    'X-Tenant-Id': auth.tenantId,
    'X-Project-Id': auth.projectId,
  }
}

function appClientCookieFromResponse(response) {
  const setCookieValues = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean)
  for (const value of setCookieValues) {
    const match = String(value).match(/(?:^|,\s*)SPARK_APP_CLIENT_ID=([^;,]+)/)
    if (match) return `SPARK_APP_CLIENT_ID=${match[1]}`
  }
  return ''
}

function matchesTurn(data, sessionId, turnId) {
  if (!isRecord(data)) return false
  const sid = data.sessionId ?? data.frame?.sessionId
  const tid = data.turnId ?? data.frame?.turnId
  return sid === sessionId && tid === turnId
}

async function readEnvJava() {
  try {
    const text = await readFile(resolve(process.cwd(), '.env.java'), 'utf8')
    const result = {}
    for (const line of text.split(/\r?\n/u)) {
      const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim())
      if (match) result[match[1]] = match[2]
    }
    return result
  } catch {
    return {}
  }
}

async function readJson(response) {
  const text = await response.text()
  if (text.trim().length === 0) return null
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

function addFinding(level, name, detail) {
  findings.push({ level, name, detail })
  const prefix = level === 'pass' ? 'PASS' : level === 'fail' ? 'FAIL' : level === 'warn' ? 'WARN' : 'INFO'
  console.log(`[${prefix}] ${name}: ${detail}`)
}

function report() {
  const failed = findings.filter(item => item.level === 'fail')
  console.log('')
  console.log(`summary: ${findings.length} checks, ${failed.length} failed`)
  if (failed.length > 0) process.exitCode = 1
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
  ])
}

async function waitUntil(predicate, timeoutMs, label) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`${label} timeout after ${timeoutMs}ms`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
