import type { Router } from 'vue-router'
import { onPageConfigServerEvent } from '@spark-view/spark-page-config/services'
import { getUser } from '@/services/auth'
import { http } from '@/services/http'

interface DebugRouteRequestEvent {
  requestId?: string
  reason?: string
  path?: string
  pageId?: string
  tenantId?: string
  projectId?: string
  replace?: boolean
  timestamp?: number
}

interface RouteResultPayload {
  requestId?: string
  reason?: string
  status: 'success' | 'error' | 'ignored'
  message?: string
  path?: string
  pageId?: string
  targetPath?: string
  currentPath?: string
  tenantId?: string
  projectId?: string
  timestamp: number
}

interface RouteBridgeOptions {
  router: Router
  switchProject?: (projectId: string) => Promise<void>
}

const DEBUG_ROUTE_REQUEST_EVENT = 'debug-route-request'

let _stop: (() => void) | null = null
let _navigating = false

function normalizeSubPath(event: DebugRouteRequestEvent): string | undefined {
  if (typeof event.path === 'string' && event.path.trim() !== '') {
    const path = event.path.trim()
    if (path.startsWith('/t/')) return path
    return path.startsWith('/') ? path : `/${path}`
  }
  if (typeof event.pageId === 'string' && event.pageId.trim() !== '') {
    return `/${event.pageId.trim().replace(/^\/+/, '')}`
  }
  return undefined
}

function resolveRequestId(event: DebugRouteRequestEvent): string | undefined {
  if (typeof event.requestId === 'string' && event.requestId.trim() !== '') {
    return event.requestId.trim()
  }
  return undefined
}

function parseCurrentScope(path: string): { tenantId?: string; projectId?: string } {
  const match = /^\/t\/([^/]+)\/([^/]+)/.exec(path)
  if (!match?.[1] || !match[2]) return {}
  return { tenantId: match[1], projectId: match[2] }
}

function resolveTargetPath(event: DebugRouteRequestEvent, currentPath: string): {
  targetPath?: string
  tenantId?: string
  projectId?: string
} {
  const subPath = normalizeSubPath(event)
  if (subPath === undefined) return {}
  if (subPath.startsWith('/t/')) return { targetPath: subPath }

  const user = getUser()
  const currentScope = parseCurrentScope(currentPath)
  const tenantId = (typeof event.tenantId === 'string' && event.tenantId.trim() !== '')
    ? event.tenantId.trim()
    : (user?.tenantId ?? currentScope.tenantId)
  const projectId = (typeof event.projectId === 'string' && event.projectId.trim() !== '')
    ? event.projectId.trim()
    : (user?.defaultProjectId ?? currentScope.projectId)

  if (tenantId && projectId) {
    return { targetPath: `/t/${tenantId}/${projectId}${subPath}`, tenantId, projectId }
  }

  return { targetPath: subPath }
}

function createResultPayload(
  event: DebugRouteRequestEvent,
  status: RouteResultPayload['status'],
  extra?: Partial<RouteResultPayload>,
): RouteResultPayload {
  const payload: RouteResultPayload = {
    status,
    timestamp: Date.now(),
  }

  const requestId = resolveRequestId(event)
  if (requestId !== undefined) payload.requestId = requestId
  if (typeof event.reason === 'string' && event.reason.trim() !== '') payload.reason = event.reason.trim()
  if (typeof event.path === 'string' && event.path.trim() !== '') payload.path = event.path.trim()
  if (typeof event.pageId === 'string' && event.pageId.trim() !== '') payload.pageId = event.pageId.trim()
  if (typeof event.tenantId === 'string' && event.tenantId.trim() !== '') payload.tenantId = event.tenantId.trim()
  if (typeof event.projectId === 'string' && event.projectId.trim() !== '') payload.projectId = event.projectId.trim()

  if (extra !== undefined) {
    Object.assign(payload, extra)
  }

  return payload
}

async function reportRouteResult(payload: RouteResultPayload): Promise<void> {
  try {
    await http.post('/api/ai/debug/route-result', payload)
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[SSE] 路由回执上报失败', { payload, error })
    }
  }
}

async function handleRouteRequest(event: DebugRouteRequestEvent, options: RouteBridgeOptions): Promise<void> {
  if (_navigating) {
    await reportRouteResult(createResultPayload(event, 'ignored', { message: '路由跳转处理中，忽略本次请求' }))
    return
  }

  _navigating = true
  try {
    const currentPath = options.router.currentRoute.value.fullPath
    const resolved = resolveTargetPath(event, currentPath)
    if (!resolved.targetPath) {
      await reportRouteResult(createResultPayload(event, 'ignored', {
        message: '缺少 path/pageId，无法执行跳转',
        currentPath,
      }))
      return
    }

    if (resolved.projectId !== undefined) {
      const currentProject = getUser()?.defaultProjectId
      if (resolved.projectId !== currentProject && options.switchProject) {
        await options.switchProject(resolved.projectId)
      }
    }

    if (event.replace === true) {
      await options.router.replace(resolved.targetPath)
    } else {
      await options.router.push(resolved.targetPath)
    }

    const successExtra: Partial<RouteResultPayload> = {
      message: '路由跳转成功',
      targetPath: resolved.targetPath,
      currentPath: options.router.currentRoute.value.fullPath,
    }
    if (resolved.tenantId !== undefined) successExtra.tenantId = resolved.tenantId
    if (resolved.projectId !== undefined) successExtra.projectId = resolved.projectId

    await reportRouteResult(createResultPayload(event, 'success', successExtra))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await reportRouteResult(createResultPayload(event, 'error', {
      message,
      currentPath: options.router.currentRoute.value.fullPath,
    }))
    if (import.meta.env.DEV) {
      console.error('[SSE] 路由跳转失败', { event, error })
    }
  } finally {
    _navigating = false
  }
}

export function startSseDebugRouteBridge(options: RouteBridgeOptions): () => void {
  if (_stop) return _stop

  _stop = onPageConfigServerEvent<DebugRouteRequestEvent>(DEBUG_ROUTE_REQUEST_EVENT, (event) => {
    void handleRouteRequest(event, options)
  })

  return () => {
    _stop?.()
    _stop = null
  }
}
