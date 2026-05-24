/**
 * APP 层 AI 调试桥接器。
 *
 * 后端通过 APP 公共 SSE 下发 route/screenshot 请求，本桥接器在浏览器壳层
 * 执行业务动作，再用 HTTP 回传结果。`spark-ai` 包只提供订阅/发射 API，
 * 不持有 Router、DOM、截图和通知 UI 这些浏览器应用能力。
 */

import { nextTick } from 'vue'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import { getUser } from '@/services/auth'
import { createAuthHeaders } from '@/services/http'
import {
  onDebugRouteRequest,
  onDebugScreenshotRequest,
  type DebugRouteRequestEvent,
  type DebugScreenshotRequestEvent,
} from '@/services/sse-events'
import { buildTenantPath, parseTenantScope, type TenantProjectScope } from '@/services/tenant-scope'
import { isRecord } from '@spark-view/spark-utils'

// Public contract -----------------------------------------------------------

type AiDebugBridgeOptions = {
  router: Router
  route: RouteLocationNormalizedLoaded
  publicPaths: ReadonlySet<string>
  platformPathPrefix?: string
}

type AiDebugBridge = {
  start(): () => void
}

const DEFAULT_PLATFORM_PATH_PREFIX = '/platform'

export function createAiDebugBridge(options: AiDebugBridgeOptions): AiDebugBridge {
  return {
    start() {
      const stopRoute = onDebugRouteRequest((event) => {
        void handleDebugRouteRequest(event, options)
      })
      const stopScreenshot = onDebugScreenshotRequest((event) => {
        void handleDebugScreenshotRequest(event, options.route)
      })
      return () => {
        stopRoute()
        stopScreenshot()
      }
    },
  }
}

// Route request flow --------------------------------------------------------

async function handleDebugRouteRequest(
  event: DebugRouteRequestEvent,
  options: AiDebugBridgeOptions,
): Promise<void> {
  try {
    const targetPath = resolveDebugRouteTarget(event, options)
    if (event.replace === true) {
      await options.router.replace(targetPath)
    } else {
      await options.router.push(targetPath)
    }
    await options.router.isReady()
    await nextTick()
    await reportDebugRouteResult(event, {
      status: 'success',
      targetPath,
      currentPath: options.router.currentRoute.value.fullPath,
      timestamp: Date.now(),
    })
  } catch (error: unknown) {
    await reportDebugRouteResult(event, {
      status: 'error',
      message: errorMessage(error),
      currentPath: options.router.currentRoute.value.fullPath,
      timestamp: Date.now(),
    })
  }
}

function resolveDebugRouteTarget(
  event: DebugRouteRequestEvent,
  options: AiDebugBridgeOptions,
): string {
  const platformPathPrefix = options.platformPathPrefix ?? DEFAULT_PLATFORM_PATH_PREFIX
  const explicitPath = event.path ? toRouterPath(event.path) : null
  if (explicitPath !== null) {
    if (isAbsoluteAppPath(explicitPath, platformPathPrefix, options.publicPaths)) {
      return explicitPath
    }
    const scope = resolveDebugTenantScope(event, options.route)
    return scope ? buildTenantPath(scope, explicitPath) : explicitPath
  }

  if (event.pageId) {
    const scope = resolveDebugTenantScope(event, options.route)
    const pagePath = `/${event.pageId}`
    return scope ? buildTenantPath(scope, pagePath) : pagePath
  }

  throw new Error('调试路由请求缺少 path 或 pageId')
}

function isAbsoluteAppPath(
  path: string,
  platformPathPrefix: string,
  publicPaths: ReadonlySet<string>,
): boolean {
  return (
    path.startsWith('/t/')
    || path.startsWith(platformPathPrefix)
    || path === '/login'
    || publicPaths.has(path)
  )
}

async function reportDebugRouteResult(
  event: DebugRouteRequestEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  await postDebugResult({
    path: '/api/ai/debug/route-result',
    requestId: event.requestId,
    payload,
    label: '路由',
  })
}

// Screenshot request flow ---------------------------------------------------

async function handleDebugScreenshotRequest(
  event: DebugScreenshotRequestEvent,
  route: RouteLocationNormalizedLoaded,
): Promise<void> {
  try {
    await nextTick()
    await reportDebugScreenshotResult(event, await captureDebugScreenshot(event, route))
  } catch (error: unknown) {
    await reportDebugScreenshotResult(event, {
      status: 'error',
      selector: event.selector ?? null,
      pageId: event.pageId ?? readRoutePageId(route),
      message: errorMessage(error),
      textDigest: '',
      timestamp: Date.now(),
    })
  }
}

async function captureDebugScreenshot(
  event: DebugScreenshotRequestEvent,
  route: RouteLocationNormalizedLoaded,
): Promise<Record<string, unknown>> {
  const target = resolveScreenshotTarget(event)
  const textDigest = buildTextDigest(target)
  const html2canvas = (await import('html2canvas')).default
  const canvas = await html2canvas(target, {
    backgroundColor: null,
    logging: false,
    scale: Math.min(window.devicePixelRatio || 1, 2),
    useCORS: true,
  })
  const blob = await canvasToPngBlob(canvas)
  const uploaded = await uploadDebugScreenshot(blob, event.requestId)
  return {
    status: 'success',
    selector: event.selector ?? null,
    pageId: event.pageId ?? readRoutePageId(route),
    textDigest,
    fileId: uploaded['fileId'] ?? null,
    name: uploaded['name'] ?? null,
    size: uploaded['size'] ?? blob.size,
    mimeType: uploaded['mimeType'] ?? blob.type,
    timestamp: Date.now(),
  }
}

function resolveScreenshotTarget(event: DebugScreenshotRequestEvent): HTMLElement {
  if (!event.selector) return document.documentElement
  const target = document.querySelector(event.selector)
  if (!(target instanceof HTMLElement)) {
    throw new Error(`截图目标不存在或不是 HTMLElement: ${event.selector}`)
  }
  return target
}

function buildTextDigest(target: HTMLElement): string {
  // textDigest 让 MJS live 脚本无需下载图片，也能校验截图目标是否加载了期望内容。
  return target.textContent
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4_000)
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }
      reject(new Error('截图 canvas 转换 PNG 失败'))
    }, 'image/png')
  })
}

async function uploadDebugScreenshot(blob: Blob, requestId: string): Promise<Record<string, unknown>> {
  const fileName = `debug-screenshot-${requestId}.png`
  const formData = new FormData()
  formData.append('file', blob, fileName)

  const response = await fetch('/api/ai/upload', {
    method: 'POST',
    headers: createAuthHeaders(),
    body: formData,
  })
  if (!response.ok) {
    throw new Error(`截图上传失败: HTTP ${response.status}`)
  }

  const parsed: unknown = await response.json()
  const data = unwrapEnvelopeData(parsed)
  return isRecord(data) ? data : {}
}

async function reportDebugScreenshotResult(
  event: DebugScreenshotRequestEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  await postDebugResult({
    path: '/api/ai/debug/screenshot-result',
    requestId: event.requestId,
    payload,
    label: '截图',
  })
}

// HTTP result reporting -----------------------------------------------------

type DebugResultPostInput = Readonly<{
  path: string
  requestId: string
  payload: Record<string, unknown>
  label: string
}>

async function postDebugResult(input: DebugResultPostInput): Promise<void> {
  const { path, requestId, payload, label } = input
  try {
    await postDebugJson(path, { requestId, ...payload })
  } catch (error: unknown) {
    if (import.meta.env.DEV) {
      console.error(`[AI Debug] ${label}回执提交失败`, error)
    }
  }
}

async function postDebugJson(path: string, payload: Record<string, unknown>): Promise<void> {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      ...createAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(`调试回执提交失败: HTTP ${response.status}`)
  }
}

function unwrapEnvelopeData(payload: unknown): unknown {
  if (
    isRecord(payload)
    && payload['protocolVersion'] === 4
    && Object.prototype.hasOwnProperty.call(payload, 'data')
  ) {
    return payload['data']
  }
  return payload
}

// Route and scope helpers ---------------------------------------------------

function resolveDebugTenantScope(
  event: DebugRouteRequestEvent,
  route: RouteLocationNormalizedLoaded,
): TenantProjectScope | null {
  if (event.tenantId && event.projectId) {
    return { tenantId: event.tenantId, projectId: event.projectId }
  }

  const routeScope = parseTenantScope(route.path)
  if (routeScope !== null) return routeScope

  const user = getUser()
  if (user?.tenantId && user.defaultProjectId) {
    return { tenantId: user.tenantId, projectId: user.defaultProjectId }
  }
  return null
}

function toRouterPath(rawPath: string): string {
  const trimmed = rawPath.trim()
  if (trimmed.length === 0) return '/'
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return trimmed

  const url = new URL(trimmed)
  // 调试事件可能来自脚本，跨 origin URL 必须拒绝，避免 SSE 变成开放跳转入口。
  if (url.origin !== window.location.origin) {
    throw new Error(`调试路由不允许跨 origin: ${url.origin}`)
  }
  return `${url.pathname}${url.search}${url.hash}`
}

function readRoutePageId(route: RouteLocationNormalizedLoaded): string | null {
  const pageId = route.meta['pageId']
  return typeof pageId === 'string' && pageId.length > 0 ? pageId : null
}

// Scalar helpers ------------------------------------------------------------


function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
