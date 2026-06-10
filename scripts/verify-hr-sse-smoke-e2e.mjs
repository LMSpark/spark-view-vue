#!/usr/bin/env node
/**
 * 最小化 HR SSE host-run E2E：Node 监听结果 + 打开浏览器 launchUrl。
 */
import { spawn } from 'node:child_process'
import { subscribeAppSseEvents } from './app-sse-client.mjs'

const APP_URL = (process.env.SPARK_APP_URL ?? 'http://localhost:5273').replace(/\/+$/, '')
const TENANT_ID = 'lmspark'
const PROJECT_ID = 'hr-enterprise-planning-smoke'
const TIMEOUT_MS = Number(process.env.HR_SMOKE_E2E_TIMEOUT_MS ?? 180_000)
const REQUEST_ID = process.env.HR_SMOKE_REQUEST_ID ?? `hr-e2e-${Date.now()}`

const REQUIREMENT = process.env.HR_SMOKE_REQUIREMENT ?? '策划一个员工档案模块，只产出 navigation 概要，不进入 pageDesign。'

async function main() {
  const payload = {
    requestId: REQUEST_ID,
    alias: 'projectPlanning',
    args: {
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      requirement: REQUIREMENT,
      saveNavigationAfterRun: false,
    },
    timeoutMs: TIMEOUT_MS,
    login: { tenantId: TENANT_ID, username: 'admin', password: 'admin123' },
    ensureProject: { tenantId: TENANT_ID, projectId: PROJECT_ID },
  }
  const launchUrl = `${APP_URL}/login?sparkAiHostRun=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`
  console.log(`[hr-e2e] requestId=${REQUEST_ID}`)
  console.log(`[hr-e2e] timeoutMs=${TIMEOUT_MS}`)
  console.log(`[hr-e2e] launchUrl=${launchUrl}`)

  const result = await waitForHostRunResult({
    requestId: REQUEST_ID,
    timeoutMs: TIMEOUT_MS,
    launchUrl,
    openBrowser: process.argv.includes('--no-open') ? false : true,
  })

  console.log(`[hr-e2e] status=${result.status}`)
  if (result.status !== 'completed') {
    console.error('[hr-e2e] error=', JSON.stringify(result.error ?? result))
    process.exitCode = 1
    return
  }
  const events = Array.isArray(result.sseEvents) ? result.sseEvents : []
  console.log(`[hr-e2e] sseEvents=${events.join(',')}`)
  console.log(`[hr-e2e] toolCalls=${Array.isArray(result.toolCalls) ? result.toolCalls.length : 0}`)
  console.log('[hr-e2e] ok')
}

async function waitForHostRunResult(options) {
  const controller = new AbortController()
  let settled = false
  try {
    return await new Promise((resolveResult, rejectResult) => {
      let subscription
      const timeout = setTimeout(() => {
        settled = true
        subscription?.close()
        rejectResult(new Error(`Timed out waiting for ai-host-run-result: ${options.requestId}`))
      }, options.timeoutMs)
      subscription = subscribeAppSseEvents({
        url: `${APP_URL}/api/events`,
        events: ['ai-host-run-result'],
        signal: controller.signal,
        onEvent: (event) => {
          const data = event.data
          if (!isRecord(data) || data.requestId !== options.requestId) return
          settled = true
          clearTimeout(timeout)
          subscription.close()
          resolveResult(data)
        },
        onError: rejectResult,
      })
      subscription.opened.then(() => {
        if (options.openBrowser) openLaunchUrl(options.launchUrl)
        else console.log('[hr-e2e] open launchUrl in the front-end browser manually')
      }).catch(rejectResult)
      subscription.closed.catch((error) => {
        if (!settled) {
          clearTimeout(timeout)
          rejectResult(error)
        }
      })
    })
  } finally {
    controller.abort()
  }
}

function openLaunchUrl(url) {
  const command = process.platform === 'win32'
    ? { file: 'cmd', args: ['/c', 'start', '', url] }
    : process.platform === 'darwin'
      ? { file: 'open', args: [url] }
      : { file: 'xdg-open', args: [url] }
  const child = spawn(command.file, command.args, { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
