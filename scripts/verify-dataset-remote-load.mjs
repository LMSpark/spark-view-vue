#!/usr/bin/env node

import { randomUUID } from 'node:crypto'

function parseArgs(argv) {
  const options = {
    pageId: 'dynamic-columns',
    backendBase: 'http://127.0.0.1:8080',
    frontendBase: 'http://127.0.0.1:5173',
    selector: '',
    expectText: '',
    timeoutMs: 90_000,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg?.startsWith('--')) continue

    const key = arg.slice(2)
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) continue

    switch (key) {
      case 'pageId':
        options.pageId = value
        i++
        break
      case 'backend':
        options.backendBase = value.replace(/\/+$/, '')
        i++
        break
      case 'frontend':
        options.frontendBase = value.replace(/\/+$/, '')
        i++
        break
      case 'selector':
        options.selector = value
        i++
        break
      case 'expectText':
        options.expectText = value
        i++
        break
      case 'timeoutMs': {
        const parsed = Number(value)
        if (Number.isFinite(parsed) && parsed > 0) {
          options.timeoutMs = parsed
        }
        i++
        break
      }
      default:
        break
    }
  }

  if (!options.selector) {
    options.selector = `.spark-page-container[data-page="${options.pageId}"]`
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

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const eventsUrl = makeUrl(options.backendBase, '/api/events')
  const routeUrl = makeUrl(options.backendBase, '/api/ai/debug/route-request')
  const screenshotUrl = makeUrl(options.backendBase, '/api/ai/debug/screenshot-request')

  console.log('[verify] 健康检查中...')
  await ensureOk(makeUrl(options.backendBase, '/health'), '后端 health')
  await ensureOk(makeUrl(options.frontendBase, '/'), '前端首页')

  const routeRequestId = randomUUID()
  console.log(`[verify] 发送路由指令 -> ${options.pageId} requestId=${routeRequestId}`)
  const routeResult = await waitEventWithTrigger({
    eventsUrl,
    targetEvent: 'debug-route-result',
    requestId: routeRequestId,
    timeoutMs: options.timeoutMs,
    trigger: async () => {
      await postJson(routeUrl, {
        requestId: routeRequestId,
        reason: 'verify-dataset-remote-load',
        pageId: options.pageId,
        replace: false,
      })
    },
  })

  if (routeResult?.status !== 'success') {
    throw new Error(`路由回执非成功: ${JSON.stringify(routeResult)}`)
  }
  console.log(`[verify] 路由回执成功 currentPath=${routeResult.currentPath}`)

  const screenshotRequestId = randomUUID()
  console.log(`[verify] 发送截图指令 requestId=${screenshotRequestId}`)
  const screenshotResult = await waitEventWithTrigger({
    eventsUrl,
    targetEvent: 'debug-screenshot-result',
    requestId: screenshotRequestId,
    timeoutMs: options.timeoutMs,
    trigger: async () => {
      await postJson(screenshotUrl, {
        requestId: screenshotRequestId,
        reason: 'verify-dataset-remote-load',
        pageId: options.pageId,
        selector: options.selector,
      })
    },
  })

  if (screenshotResult?.status !== 'success') {
    throw new Error(`截图回执非成功: ${JSON.stringify(screenshotResult)}`)
  }

  const digest = typeof screenshotResult?.textDigest === 'string'
    ? screenshotResult.textDigest
    : ''
  if (options.expectText && !digest.includes(options.expectText)) {
    throw new Error(`截图 textDigest 未包含期望文本: ${options.expectText}，实际=${digest}`)
  }

  console.log('[verify] ✅ DataSet 远程加载验证通过')
  console.log(`[verify] fileId=${screenshotResult.fileId ?? 'N/A'}`)
  console.log(`[verify] digest=${digest}`)
}

main().catch((error) => {
  console.error('[verify] ❌ 验证失败')
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
