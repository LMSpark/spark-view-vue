/**
 * 统一 SSE 事件总线（单例连接，按事件类型分发）
 *
 * 所有消费者共享同一个 EventSource（连接 /api/events），
 * 通过 SSE event 字段按类型分发回调。
 *
 * 职责单一：仅管理 SSE 连接和事件分发，不涉及 AI 逻辑 / 缓存 / 文件操作。
 */

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/**
 * 服务端 SSE 事件类型常量
 * 与后端 SseService.EVENT_* 保持一致
 */
export const ServerEventType = {
  PAGE_CONFIG: 'page-config',
  DEBUG_SCREENSHOT_REQUEST: 'debug-screenshot-request',
  DEBUG_SCREENSHOT_RESULT: 'debug-screenshot-result',
  DEBUG_ROUTE_REQUEST: 'debug-route-request',
  DEBUG_ROUTE_RESULT: 'debug-route-result',
} as const

export type ServerEventTypeName = (typeof ServerEventType)[keyof typeof ServerEventType]

export interface FileChangeEvent {
  pageId: string
  file: string
  timestamp: number
}

export interface DebugScreenshotRequestEvent {
  requestId?: string
  reason?: string
  selector?: string
  pageId?: string
  timestamp?: number
}

export interface DebugScreenshotResultEvent {
  requestId?: string
  pageId?: string
  reason?: string
  status?: 'success' | 'error' | 'busy'
  message?: string
  fileId?: string
  name?: string
  size?: number
  mimeType?: string
  timestamp?: number
  serverTimestamp?: number
}

export interface DebugRouteRequestEvent {
  requestId?: string
  reason?: string
  path?: string
  pageId?: string
  tenantId?: string
  projectId?: string
  replace?: boolean
  timestamp?: number
}

export interface DebugRouteResultEvent {
  requestId?: string
  reason?: string
  status?: 'success' | 'error' | 'ignored'
  message?: string
  path?: string
  pageId?: string
  targetPath?: string
  currentPath?: string
  tenantId?: string
  projectId?: string
  timestamp?: number
  serverTimestamp?: number
}

// ─── 连接管理 ────────────────────────────────────────────────────────────────

/** 按事件类型存储的订阅回调集合 */
const _eventSubscribers = new Map<string, Set<(data: unknown) => void>>()
let _sharedEs: EventSource | null = null
let _retryCount = 0
const _MAX_RETRIES = 5
let _sseUrl = '/api/events'

/**
 * 配置 SSE 端点 URL（在建立连接前调用）。
 * 默认值为 '/api/events'。
 */
export function configureSseUrl(url: string): void {
  if (_sharedEs) {
    _teardown()
  }
  _sseUrl = url
}

function _totalSubscribers(): number {
  let count = 0
  for (const set of _eventSubscribers.values()) {
    count += set.size
  }
  return count
}

function _ensureConnection(): void {
  if (_sharedEs) return
  _retryCount = 0
  const es = new EventSource(_sseUrl)
  _sharedEs = es

  // 为已有订阅的事件类型注册 listener
  for (const eventType of _eventSubscribers.keys()) {
    _addEsListener(es, eventType)
  }

  es.onerror = () => {
    _retryCount++
    if (_retryCount > _MAX_RETRIES) {
      _teardown()
      if (import.meta.env.DEV) {
        console.warn('[SSE] 已达最大重连次数，停止监听')
      }
    }
  }
}

function _addEsListener(es: EventSource, eventType: string): void {
  es.addEventListener(eventType, ((e: MessageEvent) => {
    _retryCount = 0
    try {
      const data: unknown = JSON.parse(e.data as string)
      const subs = _eventSubscribers.get(eventType)
      if (subs) {
        for (const cb of subs) {
          cb(data)
        }
      }
    } catch { /* ignore malformed events */ }
  }) as EventListener)
}

function _teardown(): void {
  _sharedEs?.close()
  _sharedEs = null
}

// ─── 公共 API ────────────────────────────────────────────────────────────────

/**
 * 监听服务端 SSE 事件（统一事件总线，单例共享连接）
 *
 * @param eventType 事件类型（如 'page-config'）
 * @param callback  事件回调
 * @returns 取消订阅函数
 */
export function onServerEvent<T = unknown>(
  eventType: string,
  callback: (data: T) => void,
): () => void {
  let subs = _eventSubscribers.get(eventType)
  if (!subs) {
    subs = new Set()
    _eventSubscribers.set(eventType, subs)
    // 如果 EventSource 已存在，动态追加 listener
    if (_sharedEs) {
      _addEsListener(_sharedEs, eventType)
    }
  }
  subs.add(callback as (data: unknown) => void)
  _ensureConnection()

  return () => {
    subs.delete(callback as (data: unknown) => void)
    if (subs.size === 0) {
      _eventSubscribers.delete(eventType)
    }
    if (_totalSubscribers() === 0) {
      _teardown()
    }
  }
}

/**
 * 监听页面配置文件变更（语义快捷方法）
 *
 * @returns 取消订阅函数
 */
export function onPageConfigChange(
  callback: (event: FileChangeEvent) => void,
): () => void {
  return onServerEvent<FileChangeEvent>(ServerEventType.PAGE_CONFIG, callback)
}

export function onDebugScreenshotRequest(
  callback: (event: DebugScreenshotRequestEvent) => void,
): () => void {
  return onServerEvent<DebugScreenshotRequestEvent>(ServerEventType.DEBUG_SCREENSHOT_REQUEST, callback)
}

export function onDebugScreenshotResult(
  callback: (event: DebugScreenshotResultEvent) => void,
): () => void {
  return onServerEvent<DebugScreenshotResultEvent>(ServerEventType.DEBUG_SCREENSHOT_RESULT, callback)
}

export function onDebugRouteRequest(
  callback: (event: DebugRouteRequestEvent) => void,
): () => void {
  return onServerEvent<DebugRouteRequestEvent>(ServerEventType.DEBUG_ROUTE_REQUEST, callback)
}

export function onDebugRouteResult(
  callback: (event: DebugRouteResultEvent) => void,
): () => void {
  return onServerEvent<DebugRouteResultEvent>(ServerEventType.DEBUG_ROUTE_RESULT, callback)
}
