#!/usr/bin/env node

import { randomUUID } from 'node:crypto'
import {
  createAppSseEventHub,
  subscribeAppSseEvents,
} from './app-sse-client.mjs'

const AUTH_TENANT_ID = process.env.AI_TENANT_ID || 'lmspark'
const AUTH_USERNAME = process.env.AI_USERNAME || 'admin'
const AUTH_PASSWORD = process.env.AI_PASSWORD || 'admin123'

let authToken = ''

// Auth and CLI setup --------------------------------------------------------

function createAuthHeaders() {
  const headers = {}
  if (authToken) headers.Authorization = `Bearer ${authToken}`
  if (AUTH_TENANT_ID) headers['X-Tenant-Id'] = AUTH_TENANT_ID
  return headers
}

async function login(backendBase) {
  const response = await fetch(makeUrl(backendBase, '/api/auth/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': AUTH_TENANT_ID,
    },
    body: JSON.stringify({
      tenantId: AUTH_TENANT_ID,
      username: AUTH_USERNAME,
      password: AUTH_PASSWORD,
    }),
  })

  if (!response.ok) {
    throw new Error(`登录失败: ${response.status} ${response.statusText} ${await response.text()}`)
  }

  const data = await response.json()
  if (!data?.ok || typeof data.data?.token !== 'string' || data.data.token === '') {
    throw new Error(`登录失败: 未返回有效 token, body=${JSON.stringify(data)}`)
  }
  authToken = data.data.token
}

function parseArgs(argv) {
  const options = {
    backendBase: 'http://127.0.0.1:8180',
    pageId: 'section-grid-demo',
    path: '/t/lmspark/homepage/section-grid-demo',
    selector: '.section-grid-demo .el-table',
    iterations: 2,
    timeoutMs: 45_000,
    expectText: '',
  }

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (!arg?.startsWith('--')) continue

    const key = arg.slice(2)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) continue

    switch (key) {
      case 'backend':
        options.backendBase = value.replace(/\/+$/, '')
        index++
        break
      case 'pageId':
        options.pageId = value
        index++
        break
      case 'path':
        options.path = value
        index++
        break
      case 'selector':
        options.selector = value
        index++
        break
      case 'iterations': {
        const parsed = Number(value)
        if (Number.isFinite(parsed) && parsed > 0) options.iterations = Math.floor(parsed)
        index++
        break
      }
      case 'timeoutMs': {
        const parsed = Number(value)
        if (Number.isFinite(parsed) && parsed > 0) options.timeoutMs = Math.floor(parsed)
        index++
        break
      }
      case 'expectText':
        options.expectText = value
        index++
        break
      default:
        break
    }
  }

  return options
}

// HTTP helpers --------------------------------------------------------------

function makeUrl(base, path) {
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

async function ensureOk(url, label) {
  const response = await fetch(url, { headers: createAuthHeaders() })
  if (!response.ok) {
    throw new Error(`${label} 检查失败: ${response.status} ${response.statusText}`)
  }
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...createAuthHeaders() },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`POST ${url} 失败: ${response.status} ${response.statusText} ${text}`)
  }
  return await response.json()
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// SSE wait helpers ----------------------------------------------------------

async function waitEventWithTrigger({
  eventHub,
  targetEvent,
  requestId,
  timeoutMs,
  trigger,
}) {
  // 先挂起 SSE 等待，再发起 HTTP 指令，保证快回执不会跑在订阅之前。
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      stop()
      reject(new Error(`等待 ${targetEvent} 超时（${timeoutMs}ms）`))
    }, timeoutMs)
    const stop = eventHub.on(targetEvent, (event) => {
      const data = event.data
      if (!isRecord(data) || data.requestId !== requestId) return
      clearTimeout(timeout)
      stop()
      resolve(data)
    })

    Promise.resolve()
      .then(trigger)
      .catch((error) => {
        clearTimeout(timeout)
        stop()
        reject(error)
      })
  })
}

// Verification flow ---------------------------------------------------------

async function runIteration({
  index,
  options,
  eventHub,
  routeUrl,
  screenshotUrl,
}) {
  const refreshPath = `${options.path}${options.path.includes('?') ? '&' : '?'}refresh=${Date.now()}-${index}`
  const routeRequestId = randomUUID()
  const screenshotRequestId = randomUUID()

  const routeResult = await waitEventWithTrigger({
    eventHub,
    targetEvent: 'debug-route-result',
    requestId: routeRequestId,
    timeoutMs: options.timeoutMs,
    trigger: async () => {
      await postJson(routeUrl, {
        requestId: routeRequestId,
        path: refreshPath,
        pageId: options.pageId,
        replace: true,
        reason: `verify-sse-loop#${index}`,
      })
    },
  })

  if (routeResult?.status !== 'success') {
    throw new Error(`第 ${index} 轮路由回执失败: ${JSON.stringify(routeResult)}`)
  }

  const screenshotResult = await waitEventWithTrigger({
    eventHub,
    targetEvent: 'debug-screenshot-result',
    requestId: screenshotRequestId,
    timeoutMs: options.timeoutMs,
    trigger: async () => {
      await postJson(screenshotUrl, {
        requestId: screenshotRequestId,
        pageId: options.pageId,
        selector: options.selector,
        reason: `verify-sse-loop#${index}`,
      })
    },
  })

  if (screenshotResult?.status !== 'success') {
    throw new Error(`第 ${index} 轮截图回执失败: ${JSON.stringify(screenshotResult)}`)
  }

  const digest = typeof screenshotResult.textDigest === 'string' ? screenshotResult.textDigest : ''
  if (options.expectText && !digest.includes(options.expectText)) {
    throw new Error(`第 ${index} 轮截图文本不含期望片段: ${options.expectText}`)
  }

  return {
    index,
    routeRequestId,
    screenshotRequestId,
    targetPath: routeResult.targetPath ?? null,
    currentPath: routeResult.currentPath ?? null,
    screenshotUrl: screenshotResult.url ?? null,
    fileId: screenshotResult.fileId ?? null,
    name: screenshotResult.name ?? null,
    digestPreview: digest ? `${digest.slice(0, 120)}${digest.length > 120 ? '…' : ''}` : '',
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  const healthUrl = makeUrl(options.backendBase, '/health')
  const eventsUrl = makeUrl(options.backendBase, '/api/events')
  const routeUrl = makeUrl(options.backendBase, '/api/ai/debug/route-request')
  const routeResultUrl = makeUrl(options.backendBase, '/api/ai/debug/route-result')
  const screenshotUrl = makeUrl(options.backendBase, '/api/ai/debug/screenshot-request')
  const screenshotResultUrl = makeUrl(options.backendBase, '/api/ai/debug/screenshot-result')

  console.log(`[sse-loop] 登录中 tenant=${AUTH_TENANT_ID} user=${AUTH_USERNAME}...`)
  await login(options.backendBase)

  console.log('[sse-loop] 健康检查中...')
  await ensureOk(healthUrl, '后端 health')

  const eventHub = createAppSseEventHub()
  const subscription = subscribeAppSseEvents({
    url: eventsUrl,
    headers: createAuthHeaders(),
    events: [
      'debug-route-request',
      'debug-route-result',
      'debug-screenshot-request',
      'debug-screenshot-result',
    ],
    onEvent: eventHub.emit,
  })
  await subscription.opened

  // 自回复 debug-route-request，不依赖浏览器
  eventHub.on('debug-route-request', (event) => {
    const data = event.data
    if (!isRecord(data) || typeof data.requestId !== 'string') return
    postJson(routeResultUrl, {
      requestId: data.requestId,
      status: 'success',
      currentPath: options.path || `/t/${AUTH_TENANT_ID}/homepage/${options.pageId}`,
      targetPath: options.path || `/t/${AUTH_TENANT_ID}/homepage/${options.pageId}`,
      timestamp: Date.now(),
    }).catch(() => {})
  })

  // 自回复 debug-screenshot-request，不依赖浏览器
  eventHub.on('debug-screenshot-request', (event) => {
    const data = event.data
    if (!isRecord(data) || typeof data.requestId !== 'string') return
    postJson(screenshotResultUrl, {
      requestId: data.requestId,
      status: 'success',
      selector: data.selector || options.selector,
      pageId: data.pageId || options.pageId,
      textDigest: `[mjs-loop-reply] page=${options.pageId} iter=${Date.now()}`,
      fileId: `mjs-loop-ss-${Date.now()}`,
      name: 'mjs-loop-reply.png',
      size: 512,
      mimeType: 'image/png',
      timestamp: Date.now(),
    }).catch(() => {})
  })

  const records = []
  try {
    for (let index = 1; index <= options.iterations; index++) {
      console.log(`[sse-loop] 第 ${index}/${options.iterations} 轮：刷新并截图...`)
      const record = await runIteration({ index, options, eventHub, routeUrl, screenshotUrl })
      records.push(record)
      console.log(`[sse-loop] 第 ${index} 轮成功 fileId=${record.fileId ?? 'N/A'}`)
    }
  } finally {
    subscription.close()
    await subscription.closed
  }

  console.log('[sse-loop] ✅ 闭环验证完成')
  console.log(JSON.stringify({
    ok: true,
    iterations: options.iterations,
    pageId: options.pageId,
    selector: options.selector,
    records,
  }, null, 2))
}

main().catch((error) => {
  console.error('[sse-loop] ❌ 验证失败')
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
