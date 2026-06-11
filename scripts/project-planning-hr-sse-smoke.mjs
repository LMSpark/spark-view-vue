#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { subscribeAppSseEvents } from './app-sse-client.mjs'
import { openSmokeLaunchUrl } from './lib/open-smoke-browser.mjs'

const DEFAULT_TENANT_ID = 'lmspark'
const DEFAULT_PROJECT_ID = 'hr-enterprise-planning-smoke'
const DEFAULT_SMOKE_USERNAME = 'admin'
const DEFAULT_SMOKE_PASSWORD = 'admin123'
const DEFAULT_APP_URL = 'http://localhost:5273'
const DEFAULT_API_URL = DEFAULT_APP_URL
const DEFAULT_TIMEOUT_MS = 600_000
const DEFAULT_ARTIFACT = 'e2e-project-planning-hr-last.json'

const FORBIDDEN_PAGE_DESIGN_MARKERS = [
  'openPageDesign',
  'writePageFile',
  'setFileText',
  'getFileText',
  'editNodeTree',
  'editDataSet',
  'getNodeTree',
  'getDataSetTool',
]

const HR_REQUIREMENT = [
  '企业级人力资源系统策划。',
  '目标是在项目策划阶段产出导航与页面概要，覆盖组织架构、员工档案、招聘入职、合同、人事异动、考勤排班、请假加班、薪酬社保、公积金、绩效培训、审批流、报表分析与审计追踪。',
  '严格停留在 projectPlanning 阶段：只允许规划 navigation/module/page 概要，不进入 pageDesign 四文件链路，不生成页面 rule/pagedata/script/template。',
].join('\n')

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const requestId = options.requestId ?? `hr-sse-${Date.now()}`
  const artifactPath = resolve(process.cwd(), options.artifact)
  const hostRunArgs = {
    tenantId: options.tenantId,
    projectId: options.projectId,
    requirement: HR_REQUIREMENT,
    saveNavigationAfterRun: options.saveNavigationAfterRun,
  }
  const loginCommand = {
    tenantId: options.tenantId,
    username: options.username,
    password: options.password,
  }
  const launchPayload = {
    requestId,
    alias: 'projectPlanning',
    args: hostRunArgs,
    timeoutMs: options.hostRunTimeoutMs,
    reason: 'projectPlanning HR front-end SSE smoke',
    login: loginCommand,
    ensureProject: {
      tenantId: options.tenantId,
      projectId: options.projectId,
      name: '企业级人力资源系统',
      icon: 'UserRound',
      description: HR_REQUIREMENT,
    },
  }
  const launchUrl = buildLaunchUrl(options.appUrl, launchPayload)
  const redactedLaunchPayload = redactLaunchPayload(launchPayload)
  const displayLaunchUrl = buildLaunchUrl(options.appUrl, redactedLaunchPayload)

  console.log(`[hr-sse-smoke] requestId=${requestId}`)
  console.log(`[hr-sse-smoke] timeoutMs=${options.timeoutMs}`)
  console.log(`[hr-sse-smoke] hostRunTimeoutMs=${options.hostRunTimeoutMs}`)
  console.log(`[hr-sse-smoke] launchUrl=${displayLaunchUrl}`)
  console.log('[hr-sse-smoke] ensure dev stack is running and OPENAI_API_KEY is configured for spark-ai-server')

  const result = await waitForHostRunResult({
    apiUrl: options.apiUrl,
    requestId,
    timeoutMs: options.timeoutMs,
    launchUrl,
    openBrowser: options.openBrowser,
  })
  const artifact = {
    generatedAt: new Date().toISOString(),
    requestId,
    tenantId: options.tenantId,
    projectId: options.projectId,
    mode: options.saveNavigationAfterRun ? 'save-confirmed' : 'no-save',
    launchUrl: displayLaunchUrl,
    hostRunRequest: redactedLaunchPayload,
    observedEvents: ['ai-host-run-result', ...readStringArray(result, 'sseEvents')],
    result,
    launcherErrorHint: `If launch failed before SSE result, inspect browser localStorage key spark-ai-host-run-smoke:error:${requestId}`,
  }

  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
  assertHostRunResult(result)
  console.log(`[hr-sse-smoke] wrote ${artifactPath}`)
  if (options.runArtifactAssert) {
    runArtifactAssert(artifactPath, options)
  } else {
    console.log(`[hr-sse-smoke] optional L4: pnpm run verify:project-planning-hr-artifact -- ${options.artifact}`)
  }
  console.log('[hr-sse-smoke] ok')
}

function runArtifactAssert(artifactPath, options) {
  const args = [
    'scripts/assert-project-planning-hr-artifact.mjs',
    artifactPath,
    '--min-coverage-ratio',
    String(options.minCoverageRatio),
    '--min-children',
    String(options.minChildren),
  ]
  console.log(`[hr-sse-smoke] running L4 artifact assert: node ${args.join(' ')}`)
  const child = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
  })
  if (child.stdout) process.stdout.write(child.stdout)
  if (child.stderr) process.stderr.write(child.stderr)
  if (child.status !== 0) {
    throw new Error('L4 projectPlanning HR artifact assert failed')
  }
}

async function waitForHostRunResult(options) {
  const controller = new AbortController()
  let settled = false

  try {
    const result = new Promise((resolveResult, rejectResult) => {
      let subscription
      const timeout = setTimeout(() => {
        settled = true
        subscription?.close()
        rejectResult(new Error(`Timed out waiting for ai-host-run-result: ${options.requestId}`))
      }, options.timeoutMs)
      subscription = subscribeAppSseEvents({
        url: `${trimTrailingSlash(options.apiUrl)}/api/events`,
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
      subscription.opened
        .then(() => {
          if (options.openBrowser) {
            console.log('[hr-sse-smoke] opening launchUrl in the system browser; keep that tab open until result arrives.')
            openLaunchUrl(options.launchUrl, options.requestId).catch(rejectResult)
          } else {
            console.log('[hr-sse-smoke] open the launchUrl in the front-end app browser to start the run.')
          }
        })
        .catch(rejectResult)
      subscription.closed.catch((error) => {
        if (!settled) {
          clearTimeout(timeout)
          rejectResult(error)
        }
      })
    })
    return await result
  } finally {
    controller.abort()
  }
}

function assertHostRunResult(result) {
  if (result.status !== 'completed') {
    throw new Error(`AI Host Run did not complete: ${JSON.stringify(result.error ?? result)}`)
  }
  const serialized = JSON.stringify(readExecutionSurface(result))
  const forbidden = FORBIDDEN_PAGE_DESIGN_MARKERS.filter(marker => serialized.includes(marker))
  if (forbidden.length > 0) {
    throw new Error(`projectPlanning smoke touched pageDesign markers: ${forbidden.join(', ')}`)
  }
  const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : []
  if (toolCalls.length === 0) {
    throw new Error('projectPlanning smoke completed without tool calls.')
  }
  const toolNames = toolCalls
    .map(call => isRecord(call) && typeof call.toolName === 'string' ? call.toolName : '')
    .filter(Boolean)
  if (!toolNames.includes('model_script')) {
    throw new Error(`projectPlanning smoke completed without model_script; saw: ${toolNames.join(', ') || '(none)'}`)
  }
  const events = readStringArray(result, 'sseEvents')
  if (!events.includes('llm-frame')) {
    throw new Error('projectPlanning smoke did not observe APP SSE llm-frame events.')
  }
}

function readExecutionSurface(result) {
  const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : []
  const projectPlanning = isRecord(result.projectPlanning) ? result.projectPlanning : {}
  return {
    text: typeof result.text === 'string' ? result.text : '',
    toolCalls: toolCalls.map(call => ({
      toolName: isRecord(call) && typeof call.toolName === 'string' ? call.toolName : '',
      argsPreview: isRecord(call) && typeof call.argsPreview === 'string' ? call.argsPreview : '',
    })),
    navigationRoot: isRecord(projectPlanning) ? projectPlanning.navigationRoot : undefined,
    directNavigationRoot: result.navigationRoot,
  }
}

function buildLaunchUrl(appUrl, payload) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const url = new URL('/login', appUrl)
  url.searchParams.set('sparkAiHostRun', encoded)
  return url.toString()
}

function redactLaunchPayload(payload) {
  if (!isRecord(payload.login)) return payload
  return {
    ...payload,
    login: {
      ...payload.login,
      password: '***',
    },
  }
}

async function openLaunchUrl(url, requestId) {
  const launch = await openSmokeLaunchUrl(url, { profileName: requestId })
  const isolation = launch.isolated ? ` isolatedProfile=${launch.profileDir}` : ''
  const mode = launch.headless ? ' headless=true' : ''
  const debugPort = launch.devToolsPort === undefined ? '' : ` devToolsPort=${launch.devToolsPort}`
  console.log(`[hr-sse-smoke] browserLaunch=${launch.command}${mode}${debugPort}${isolation}`)
}

function parseArgs(args) {
  const options = {
    tenantId: DEFAULT_TENANT_ID,
    projectId: DEFAULT_PROJECT_ID,
    appUrl: process.env['SPARK_APP_URL'] ?? DEFAULT_APP_URL,
    apiUrl: process.env['SPARK_API_URL'] ?? DEFAULT_API_URL,
    artifact: DEFAULT_ARTIFACT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    hostRunTimeoutMs: undefined,
    saveNavigationAfterRun: false,
    openBrowser: true,
    runArtifactAssert: true,
    minCoverageRatio: 0.7,
    minChildren: 3,
    requestId: undefined,
    username: process.env['SPARK_SMOKE_USERNAME'] ?? DEFAULT_SMOKE_USERNAME,
    password: process.env['SPARK_SMOKE_PASSWORD'] ?? DEFAULT_SMOKE_PASSWORD,
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    switch (arg) {
      case '--assert':
        options.runArtifactAssert = true
        break
      case '--no-assert':
        options.runArtifactAssert = false
        break
      case '--min-coverage-ratio':
        options.minCoverageRatio = readRatio(readNext(args, ++index, arg), arg)
        break
      case '--min-children':
        options.minChildren = readPositiveInteger(readNext(args, ++index, arg), arg)
        break
      case '--tenant-id':
        options.tenantId = readNext(args, ++index, arg)
        break
      case '--project-id':
        options.projectId = readNext(args, ++index, arg)
        break
      case '--app-url':
        options.appUrl = readNext(args, ++index, arg)
        break
      case '--api-url':
        options.apiUrl = readNext(args, ++index, arg)
        break
      case '--artifact':
        options.artifact = readNext(args, ++index, arg)
        break
      case '--timeout-ms':
        options.timeoutMs = readPositiveInteger(readNext(args, ++index, arg), arg)
        break
      case '--host-run-timeout-ms':
        options.hostRunTimeoutMs = readPositiveInteger(readNext(args, ++index, arg), arg)
        break
      case '--request-id':
        options.requestId = readNext(args, ++index, arg)
        break
      case '--username':
        options.username = readNext(args, ++index, arg)
        break
      case '--password':
        options.password = readNext(args, ++index, arg)
        break
      case '--no-save':
        options.saveNavigationAfterRun = false
        break
      case '--save-confirmed':
        options.saveNavigationAfterRun = true
        break
      case '--no-open':
        options.openBrowser = false
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }
  if (options.tenantId.trim().length === 0) throw new Error('--tenant-id is required')
  if (options.projectId.trim().length === 0) throw new Error('--project-id is required')
  if (options.username.trim().length === 0) throw new Error('--username is required')
  if (options.password.trim().length === 0) throw new Error('--password is required')
  options.hostRunTimeoutMs = options.hostRunTimeoutMs ?? Math.max(10_000, options.timeoutMs - 30_000)
  if (options.hostRunTimeoutMs >= options.timeoutMs) {
    throw new Error('--host-run-timeout-ms must be smaller than --timeout-ms')
  }
  return options
}

function readNext(args, index, flag) {
  const value = args[index]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`)
  }
  return value
}

function readPositiveInteger(value, flag) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`)
  }
  return parsed
}

function readRatio(value, flag) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    throw new Error(`${flag} must be a number in (0, 1]`)
  }
  return parsed
}

function readStringArray(record, field) {
  const value = record[field]
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '')
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
