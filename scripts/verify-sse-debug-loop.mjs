#!/usr/bin/env node

import { randomUUID } from 'node:crypto'

function parseArgs(argv) {
  const options = {
    backendBase: 'http://127.0.0.1:8080',
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

function makeUrl(base, path) {
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

async function ensureOk(url, label) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${label} 检查失败: ${response.status} ${response.statusText}`)
  }
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`POST ${url} 失败: ${response.status} ${response.statusText} ${text}`)
  }
  return await response.json()
}

function parseSseBuffer(state, chunk, onEvent) {
  state.buffer += chunk
  const lines = state.buffer.split(/\r?\n/)
  state.buffer = lines.pop() ?? ''

  for (const line of lines) {
    if (line.startsWith('event:')) {
      state.eventType = line.slice(6).trim()
      continue
    }
    if (line.startsWith('data:')) {
      state.dataLines.push(line.slice(5).trim())
      continue
    }
    if (line === '') {
      const eventType = state.eventType
      const dataText = state.dataLines.join('\n').trim()
      state.eventType = ''
      state.dataLines = []

      if (!eventType || !dataText) continue
      onEvent(eventType, dataText)
    }
  }
}

async function waitEventWithTrigger({
  eventsUrl,
  targetEvent,
  requestId,
  timeoutMs,
  trigger,
}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  const response = await fetch(eventsUrl, {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
    signal: controller.signal,
  })

  if (!response.ok || !response.body) {
    clearTimeout(timeout)
    throw new Error(`SSE 连接失败: ${response.status} ${response.statusText}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const state = { buffer: '', eventType: '', dataLines: [] }
  let matched = null

  try {
    await trigger()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value, { stream: true })
      parseSseBuffer(state, text, (eventType, dataText) => {
        if (eventType !== targetEvent) return
        try {
          const parsed = JSON.parse(dataText)
          if (parsed?.requestId === requestId) {
            matched = parsed
          }
        } catch {
          // ignore malformed payload
        }
      })

      if (matched) return matched
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`等待 ${targetEvent} 超时（${timeoutMs}ms）`) 
    }
    throw error
  } finally {
    clearTimeout(timeout)
    controller.abort()
    reader.releaseLock()
  }

  throw new Error(`未收到匹配 requestId=${requestId} 的 ${targetEvent}`)
}

async function runIteration({
  index,
  options,
  eventsUrl,
  routeUrl,
  screenshotUrl,
}) {
  const refreshPath = `${options.path}${options.path.includes('?') ? '&' : '?'}refresh=${Date.now()}-${index}`
  const routeRequestId = randomUUID()
  const screenshotRequestId = randomUUID()

  const routeResult = await waitEventWithTrigger({
    eventsUrl,
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
    eventsUrl,
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
  const screenshotUrl = makeUrl(options.backendBase, '/api/ai/debug/screenshot-request')

  console.log('[sse-loop] 健康检查中...')
  await ensureOk(healthUrl, '后端 health')

  const records = []
  for (let index = 1; index <= options.iterations; index++) {
    console.log(`[sse-loop] 第 ${index}/${options.iterations} 轮：刷新并截图...`)
    const record = await runIteration({ index, options, eventsUrl, routeUrl, screenshotUrl })
    records.push(record)
    console.log(`[sse-loop] 第 ${index} 轮成功 fileId=${record.fileId ?? 'N/A'}`)
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
