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
import { buildTenantPath, parseTenantScope } from '@/services/tenant-scope'

type TenantProjectScope = {
  tenantId: string
  projectId: string}

type AiDebugBridgeOptions = {
  router: Router
  route: RouteLocationNormalizedLoaded
  publicPaths: ReadonlySet<string>
  platformPathPrefix?: string}

type AiDebugBridge = {
  start(): () => void}

const DEFAULT_PLATFORM_PATH_PREFIX = '/platform'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function readRoutePageId(route: RouteLocationNormalizedLoaded): string | null {
  const pageId = route.meta['pageId']
  return typeof pageId === 'string' && pageId.length > 0 ? pageId : null
}

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
  if (url.origin !== window.location.origin) {
    throw new Error(`调试路由不允许跨 origin: ${url.origin}`)
  }
  return `${url.pathname}${url.search}${url.hash}`
}

function resolveDebugRouteTarget(
  event: DebugRouteRequestEvent,
  options: AiDebugBridgeOptions,
): string {
  const platformPathPrefix = options.platformPathPrefix ?? DEFAULT_PLATFORM_PATH_PREFIX
  const explicitPath = event.path ? toRouterPath(event.path) : null
  if (explicitPath !== null) {
    if (
      explicitPath.startsWith('/t/')
      || explicitPath.startsWith(platformPathPrefix)
      || explicitPath === '/login'
      || options.publicPaths.has(explicitPath)
    ) {
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

async function reportDebugRouteResult(
  event: DebugRouteRequestEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await postDebugJson('/api/ai/debug/route-result', {
      requestId: event.requestId,
      ...payload,
    })
  } catch (error: unknown) {
    if (import.meta.env.DEV) {
      console.error('[AI Debug] 路由回执提交失败', error)
    }
  }
}

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

function resolveScreenshotTarget(event: DebugScreenshotRequestEvent): HTMLElement {
  if (!event.selector) return document.documentElement
  const target = document.querySelector(event.selector)
  if (!(target instanceof HTMLElement)) {
    throw new Error(`截图目标不存在或不是 HTMLElement: ${event.selector}`)
  }
  return target
}

function buildTextDigest(target: HTMLElement): string {
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

function unwrapEnvelopeData(payload: unknown): unknown {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>
    if (record['protocolVersion'] === 4 && Object.prototype.hasOwnProperty.call(record, 'data')) {
      return record['data']
    }
  }
  return payload
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
  return data !== null && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {}
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

async function reportDebugScreenshotResult(
  event: DebugScreenshotRequestEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await postDebugJson('/api/ai/debug/screenshot-result', {
      requestId: event.requestId,
      ...payload,
    })
  } catch (error: unknown) {
    if (import.meta.env.DEV) {
      console.error('[AI Debug] 截图回执提交失败', error)
    }
  }
}

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
