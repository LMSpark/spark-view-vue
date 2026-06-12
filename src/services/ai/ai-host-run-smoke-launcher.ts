/**
 * @module app:services/ai-host-run-smoke-launcher
 * 职责：提供主应用 ai-host-run-smoke-launcher 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
 * 边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
 * AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 services/ai-host-run-smoke-launcher。
 */
/**
 * Dev-only browser launcher for APP SSE Host Run smoke flows.
 *
 * The launcher is intentionally generic: scenario-specific requirements live
 * in scripts/tests and are passed through the URL payload.
 */
import { getProjectApi, getProjectDetailApi } from '@/services/api-paths'
import { login as loginUser, switchProject } from '@/services/auth'
import { http } from '@/services/http'
import { reloadAndSyncNavigation } from '@/services/project/project-shell'
import { onAiHostRunResult, waitForAppSseConnection, type AiHostRunResultEvent } from '@/services/sse-events'
import { buildTenantRootPath } from '@/services/tenant-scope'

const SEARCH_PARAM = 'sparkAiHostRun'
const LAUNCHED_STORAGE_PREFIX = 'spark-ai-host-run-smoke:launched:'
const RESULT_STORAGE_PREFIX = 'spark-ai-host-run-smoke:result:'
const ERROR_STORAGE_PREFIX = 'spark-ai-host-run-smoke:error:'
const DEFAULT_TIMEOUT_MS = 300_000
const HOST_RUN_REQUEST_MAX_ATTEMPTS = 8
const HOST_RUN_REQUEST_RETRY_BASE_MS = 400

type EnsureProjectCommand = Readonly<{
  tenantId: string
  projectId: string
  name?: string
  icon?: string
  description?: string
  homeNodeId?: string
}>

type LoginCommand = Readonly<{
  tenantId: string
  username: string
  password: string
}>

type AiHostRunSmokePayload = Readonly<{
  requestId: string
  alias: string
  args: Record<string, unknown>
  timeoutMs: number
  reason?: string
  login?: LoginCommand
  ensureProject?: EnsureProjectCommand
}>

type ResultWaiter = Readonly<{
  result: Promise<AiHostRunResultEvent>
  close(): void
}>

export function runAiHostRunSmokeLauncherFromUrl(): void {
  if (!import.meta.env.DEV) return
  const encoded = new URLSearchParams(window.location.search).get(SEARCH_PARAM)
  if (encoded === null || encoded.trim().length === 0) return

  void launchAiHostRunSmoke(encoded).catch((error: unknown) => {
    const requestId = readSmokeRequestId(encoded)
    if (requestId !== undefined) persistSmokeError(requestId, error)
    console.error('[AI Host Run Smoke] 启动失败', error)
  })
}

async function launchAiHostRunSmoke(encoded: string): Promise<void> {
  const payload = readPayload(encoded)
  logSmokeStage(payload.requestId, 'start')
  const launchKey = `${LAUNCHED_STORAGE_PREFIX}${payload.requestId}`
  if (window.sessionStorage.getItem(launchKey) === '1') {
    logSmokeStage(payload.requestId, 'skip-duplicate')
    return
  }
  window.sessionStorage.setItem(launchKey, '1')

  const waiter = createResultWaiter(payload.requestId, payload.timeoutMs)
  try {
    if (payload.login !== undefined) {
      logSmokeStage(payload.requestId, 'login-start')
      await loginUser(payload.login)
      logSmokeStage(payload.requestId, 'login-done')
    }
    await waitForAppSseConnection()
    logSmokeStage(payload.requestId, 'sse-ready')
    if (payload.ensureProject !== undefined) {
      logSmokeStage(payload.requestId, 'ensure-project-start')
      await ensureProject(payload.ensureProject)
      switchProject(payload.ensureProject.projectId)
      await reloadAndSyncNavigation()
      await syncTenantProjectPath(payload.ensureProject)
      logSmokeStage(payload.requestId, 'ensure-project-done')
    }
    logSmokeStage(payload.requestId, 'post-request-start')
    await postAiHostRunRequest(payload)
    logSmokeStage(payload.requestId, 'post-request-done')
    await waiter.result
    logSmokeStage(payload.requestId, 'result-done')
  } catch (error) {
    waiter.close()
    throw error
  }
}

async function postAiHostRunRequest(payload: AiHostRunSmokePayload): Promise<void> {
  for (let attempt = 1; attempt <= HOST_RUN_REQUEST_MAX_ATTEMPTS; attempt += 1) {
    try {
      await http.post('/api/ai/host-run/request', {
        requestId: payload.requestId,
        alias: payload.alias,
        args: payload.args,
        timeoutMs: payload.timeoutMs,
        ...(payload.reason === undefined ? {} : { reason: payload.reason }),
      })
      return
    } catch (error: unknown) {
      const shouldRetry = isAppSseNotConnected(error) && attempt < HOST_RUN_REQUEST_MAX_ATTEMPTS
      if (!shouldRetry) throw error
      await sleep(HOST_RUN_REQUEST_RETRY_BASE_MS * attempt)
      await waitForAppSseConnection()
    }
  }
}

async function syncTenantProjectPath(command: EnsureProjectCommand): Promise<void> {
  const targetPath = buildTenantRootPath({
    tenantId: command.tenantId,
    projectId: command.projectId,
  })
  if (
    window.location.pathname === targetPath
    || window.location.pathname.startsWith(`${targetPath}/`)
  ) {
    return
  }
  const query = Object.fromEntries(new URLSearchParams(window.location.search).entries())
  const router = readSparkDevRouter()
  if (router !== undefined) {
    await router.replace({ path: targetPath, query })
    return
  }
  const nextUrl = new URL(window.location.href)
  nextUrl.pathname = targetPath
  window.history.replaceState(window.history.state, '', nextUrl.toString())
}

async function ensureProject(command: EnsureProjectCommand): Promise<void> {
  try {
    await http.get(getProjectDetailApi(command.projectId, command.tenantId))
    return
  } catch (error) {
    if (!isProjectMissingError(error)) throw error
  }

  await http.post(getProjectApi(command.tenantId), {
    projectId: command.projectId,
    name: command.name ?? command.projectId,
    icon: command.icon ?? 'Box',
    description: command.description ?? '',
    ...(command.homeNodeId === undefined ? {} : { homeNodeId: command.homeNodeId }),
  })
}

function createResultWaiter(requestId: string, timeoutMs: number): ResultWaiter {
  let stop = (): void => undefined
  let timeoutId: number | undefined
  const result = new Promise<AiHostRunResultEvent>((resolve, reject) => {
    stop = onAiHostRunResult((event) => {
      if (event.requestId !== requestId) return
      window.localStorage.setItem(
        `${RESULT_STORAGE_PREFIX}${requestId}`,
        JSON.stringify(event),
      )
      cleanup()
      resolve(event)
    })
    timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error(`AI Host Run smoke timed out: requestId=${requestId}`))
    }, timeoutMs)
  })

  const cleanup = (): void => {
    stop()
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    timeoutId = undefined
  }

  return {
    result,
    close: cleanup,
  }
}

function readPayload(encoded: string): AiHostRunSmokePayload {
  const decoded: unknown = JSON.parse(decodeBase64Url(encoded))
  if (!isRecord(decoded)) {
    throw new Error('AI Host Run smoke payload must be a JSON object.')
  }
  const alias = readRequiredString(decoded, 'alias')
  const args = readRequiredRecord(decoded, 'args')
  const requestId = readOptionalString(decoded, 'requestId') ?? crypto.randomUUID()
  const timeoutMs = readPositiveNumber(decoded, 'timeoutMs') ?? DEFAULT_TIMEOUT_MS
  const reason = readOptionalString(decoded, 'reason')
  const loginCommand = readOptionalLogin(decoded['login'])
  const ensureProjectCommand = readOptionalEnsureProject(decoded['ensureProject'])
  return {
    requestId,
    alias,
    args,
    timeoutMs,
    ...(reason === undefined ? {} : { reason }),
    ...(loginCommand === undefined ? {} : { login: loginCommand }),
    ...(ensureProjectCommand === undefined ? {} : { ensureProject: ensureProjectCommand }),
  }
}

function readOptionalLogin(value: unknown): LoginCommand | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new Error('AI Host Run smoke login must be an object.')
  }
  return {
    tenantId: readRequiredString(value, 'tenantId'),
    username: readRequiredString(value, 'username'),
    password: readRequiredString(value, 'password'),
  }
}

function readOptionalEnsureProject(value: unknown): EnsureProjectCommand | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new Error('AI Host Run smoke ensureProject must be an object.')
  }
  const tenantId = readRequiredString(value, 'tenantId')
  const projectId = readRequiredString(value, 'projectId')
  const command: EnsureProjectCommand = {
    tenantId,
    projectId,
  }
  const name = readOptionalString(value, 'name')
  const icon = readOptionalString(value, 'icon')
  const description = readOptionalString(value, 'description')
  const homeNodeId = readOptionalString(value, 'homeNodeId')
  return {
    ...command,
    ...(name === undefined ? {} : { name }),
    ...(icon === undefined ? {} : { icon }),
    ...(description === undefined ? {} : { description }),
    ...(homeNodeId === undefined ? {} : { homeNodeId }),
  }
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = window.atob(padded)
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function readRequiredString(record: Record<string, unknown>, field: string): string {
  const value = readOptionalString(record, field)
  if (value === undefined) throw new Error(`AI Host Run smoke payload missing ${field}.`)
  return value
}

function readOptionalString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field]
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function readRequiredRecord(record: Record<string, unknown>, field: string): Record<string, unknown> {
  const value = record[field]
  if (!isRecord(value)) throw new Error(`AI Host Run smoke payload ${field} must be an object.`)
  return value
}

function readPositiveNumber(record: Record<string, unknown>, field: string): number | undefined {
  const value = record[field]
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return Math.floor(value)
}

function readErrorStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined
  const status = error['status']
  if (typeof status === 'number') return status
  const response = error['response']
  if (isRecord(response) && typeof response['status'] === 'number') return response['status']
  return undefined
}

function readErrorMessage(error: unknown): string {
  if (!isRecord(error)) return ''
  const message = error['message']
  if (typeof message === 'string' && message.trim().length > 0) return message
  const response = error['response']
  if (!isRecord(response)) return ''
  const responseMessage = response['message']
  if (typeof responseMessage === 'string' && responseMessage.trim().length > 0) return responseMessage
  const responseError = response['error']
  if (!isRecord(responseError)) return ''
  const errorMessage = responseError['message']
  return typeof errorMessage === 'string' ? errorMessage : ''
}

function isProjectMissingError(error: unknown): boolean {
  const status = readErrorStatus(error)
  if (status === 404) return true
  if (status !== 400) return false
  const message = readErrorMessage(error)
  return message.includes('不存在') || message.toLowerCase().includes('not found')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readSmokeRequestId(encoded: string): string | undefined {
  try {
    const payload = readPayload(encoded)
    return payload.requestId
  } catch {
    return undefined
  }
}

function persistSmokeError(requestId: string, error: unknown): void {
  window.localStorage.setItem(`${ERROR_STORAGE_PREFIX}${requestId}`, JSON.stringify({
    message: error instanceof Error ? error.message : String(error),
    at: Date.now(),
  }))
}

function logSmokeStage(requestId: string, stage: string): void {
  console.info('[AI Host Run Smoke]', JSON.stringify({ requestId, stage }))
}

function readSparkDevRouter(): SparkDevRouter | undefined {
  const sparkDev: unknown = Reflect.get(window, '__sparkDev')
  if (!isRecord(sparkDev)) return undefined
  const router = sparkDev['router']
  return isSparkDevRouter(router) ? router : undefined
}

function isSparkDevRouter(value: unknown): value is SparkDevRouter {
  return isRecord(value) && typeof value['replace'] === 'function'
}

type SparkDevRouter = Readonly<{
  replace(to: { path: string; query?: Record<string, string> }): Promise<unknown>
}>

function isAppSseNotConnected(error: unknown): boolean {
  if (!isRecord(error)) return false
  if (error['code'] === 'APP_SSE_NOT_CONNECTED') return true
  if (error['status'] !== 409) return false
  const message = error['message']
  return typeof message === 'string' && message.includes('APP_SSE_NOT_CONNECTED')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms)
  })
}
