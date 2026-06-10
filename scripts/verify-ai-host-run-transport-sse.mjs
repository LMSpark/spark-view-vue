#!/usr/bin/env node
/**
 * APP SSE Host Run transport smoke.
 *
 * This intentionally uses an unknown alias. A successful smoke is an
 * AI_HOST_RUN_UNKNOWN_ALIAS result, because that proves:
 * Node listener -> browser launcher -> /api/ai/host-run/request ->
 * APP SSE bridge -> /api/ai/host-run/result -> Node listener.
 */
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { subscribeAppSseEvents } from './app-sse-client.mjs'
import { openSmokeLaunchUrl } from './lib/open-smoke-browser.mjs'

const DEFAULT_APP_URL = 'http://localhost:5273'
const DEFAULT_TENANT_ID = 'lmspark'
const DEFAULT_USERNAME = 'admin'
const DEFAULT_PASSWORD = 'admin123'
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_ARTIFACT = 'e2e-ai-host-run-transport-last.json'
const TRANSPORT_ALIAS = '__transport_probe__'

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const requestId = options.requestId ?? `transport-sse-${Date.now()}`
  const payload = {
    requestId,
    alias: TRANSPORT_ALIAS,
    args: { probe: 'app-sse-host-run-transport' },
    timeoutMs: options.timeoutMs,
    reason: 'APP SSE host-run transport smoke',
    login: {
      tenantId: options.tenantId,
      username: options.username,
      password: options.password,
    },
  }
  const launchUrl = buildLaunchUrl(options.appUrl, payload)
  const displayLaunchUrl = buildLaunchUrl(options.appUrl, redactLaunchPayload(payload))
  console.log(`[transport-sse] requestId=${requestId}`)
  console.log(`[transport-sse] timeoutMs=${options.timeoutMs}`)
  console.log(`[transport-sse] launchUrl=${displayLaunchUrl}`)

  const result = await waitForHostRunResult({
    appUrl: options.appUrl,
    requestId,
    timeoutMs: options.timeoutMs,
    launchUrl,
    openBrowser: options.openBrowser,
  })
  assertTransportResult(result)

  const artifactPath = resolve(process.cwd(), options.artifact)
  await writeFile(artifactPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    requestId,
    alias: TRANSPORT_ALIAS,
    launchUrl: displayLaunchUrl,
    result,
  }, null, 2)}\n`, 'utf8')
  console.log(`[transport-sse] wrote ${artifactPath}`)
  console.log('[transport-sse] ok')
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
        url: `${trimTrailingSlash(options.appUrl)}/api/events`,
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
        onError: (error) => {
          clearTimeout(timeout)
          rejectResult(error)
        },
      })
      subscription.opened.then(() => {
        if (options.openBrowser) {
          openLaunchUrl(options.launchUrl, options.requestId).catch(rejectResult)
        }
        else console.log('[transport-sse] open launchUrl in the front-end browser manually')
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

function assertTransportResult(result) {
  if (result.status !== 'unknown_alias') {
    throw new Error(`Expected unknown_alias transport result, received: ${JSON.stringify(result)}`)
  }
  const error = isRecord(result.error) ? result.error : {}
  if (error.code !== 'AI_HOST_RUN_UNKNOWN_ALIAS') {
    throw new Error(`Expected AI_HOST_RUN_UNKNOWN_ALIAS, received: ${JSON.stringify(result.error ?? result)}`)
  }
}

function buildLaunchUrl(appUrl, payload) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const url = new URL('/login', appUrl)
  url.searchParams.set('sparkAiHostRun', encoded)
  return url.toString()
}

function redactLaunchPayload(payload) {
  return {
    ...payload,
    login: {
      ...payload.login,
      password: '<redacted>',
    },
  }
}

async function openLaunchUrl(url, requestId) {
  const launch = await openSmokeLaunchUrl(url, { profileName: requestId })
  const isolation = launch.isolated ? ` isolatedProfile=${launch.profileDir}` : ''
  const mode = launch.headless ? ' headless=true' : ''
  const debugPort = launch.devToolsPort === undefined ? '' : ` devToolsPort=${launch.devToolsPort}`
  console.log(`[transport-sse] browserLaunch=${launch.command}${mode}${debugPort}${isolation}`)
}

function parseArgs(args) {
  const options = {
    appUrl: DEFAULT_APP_URL,
    tenantId: DEFAULT_TENANT_ID,
    username: DEFAULT_USERNAME,
    password: DEFAULT_PASSWORD,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    artifact: DEFAULT_ARTIFACT,
    requestId: undefined,
    openBrowser: true,
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const next = args[index + 1]
    if (arg === '--no-open') options.openBrowser = false
    else if (arg === '--app-url' && next !== undefined) options.appUrl = trimTrailingSlash(next)
    else if (arg === '--tenant-id' && next !== undefined) options.tenantId = next
    else if (arg === '--username' && next !== undefined) options.username = next
    else if (arg === '--password' && next !== undefined) options.password = next
    else if (arg === '--timeout-ms' && next !== undefined) options.timeoutMs = Number(next)
    else if (arg === '--artifact' && next !== undefined) options.artifact = next
    else if (arg === '--request-id' && next !== undefined) options.requestId = next
    if (arg.startsWith('--') && next !== undefined && arg !== '--no-open') index += 1
  }
  options.appUrl = trimTrailingSlash(options.appUrl)
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error(`Invalid --timeout-ms: ${options.timeoutMs}`)
  }
  return options
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '')
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
