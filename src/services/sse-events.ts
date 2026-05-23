/**
 * 统一 SSE 事件总线（单例连接，按事件类型分发）
 *
 * 所有消费者共享同一个 EventSource（连接 /api/events），
 * 通过 SSE event 字段按类型分发回调。
 *
 * 职责单一：仅管理 SSE 连接和事件分发，不涉及缓存或文件操作。
 */

import { Logger } from '@spark-view/spark-utils'

const logger = Logger('SSE')

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/**
 * 服务端 SSE 事件类型常量
 * 与后端 SseService.EVENT_* 保持一致
 */
const ServerEventType = Object.freeze({
  PAGE_CONFIG: 'page-config',
  DATA_BATCH_JOB: 'data-batch-job',
  DATA_CHANGE: 'data-change',
  NOTIFICATION: 'notification',
  DEBUG_SCREENSHOT_REQUEST: 'debug-screenshot-request',
  DEBUG_SCREENSHOT_RESULT: 'debug-screenshot-result',
  DEBUG_ROUTE_REQUEST: 'debug-route-request',
  DEBUG_ROUTE_RESULT: 'debug-route-result',
  DEBUG_FC_ERROR_REPORT: 'debug-fc-error-report',
})

export type FileChangeEvent = {
  pageId: string
  file: string
  timestamp: number}

export type DataBatchJobEvent = {
  tenantId: string
  projectId: string
  jobId: string
  status: string
  completed: number
  total: number
  timestamp: number
  result?: unknown
  error?: string}

export type DataChangeEvent = {
  tenantId: string
  projectId: string
  tableName: string
  operation: string
  timestamp: number
  jobId?: string}

export type ServerNotificationEvent = {
  title: string
  message: string
  timestamp: number
  notificationId?: string
  level?: string
  category?: string
  source?: string
  actionUrl?: string}

export type DebugRouteRequestEvent = {
  requestId: string
  timestamp: number
  path?: string
  pageId?: string
  tenantId?: string
  projectId?: string
  replace?: boolean
  reason?: string}

export type DebugScreenshotRequestEvent = {
  requestId: string
  timestamp: number
  selector?: string
  pageId?: string
  reason?: string}

export type DebugRouteResultEvent = {
  requestId: string
  status: string
  serverTimestamp?: number
  targetPath?: string
  currentPath?: string
  message?: string}

export type DebugScreenshotResultEvent = {
  requestId: string
  status: string
  serverTimestamp?: number
  fileId?: string
  name?: string
  url?: string
  message?: string
  textDigest?: string}

export type DebugFcErrorReportEvent = {
  reportId: string
  serverTimestamp: number
  [key: string]: unknown}

function normalizeFileChangeEvent(data: unknown): FileChangeEvent | null {
  if (!isRecord(data)) return null
  const pageId = data['pageId']
  const file = data['file']
  const timestamp = data['timestamp']
  if (typeof pageId !== 'string' || typeof file !== 'string') return null

  let normalizedTimestamp: number
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    normalizedTimestamp = timestamp
  } else if (typeof timestamp === 'string') {
    const parsed = Number(timestamp)
    normalizedTimestamp = Number.isFinite(parsed) ? parsed : Date.now()
  } else {
    normalizedTimestamp = Date.now()
  }

  return { pageId, file, timestamp: normalizedTimestamp }
}

function normalizeTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return Date.now()
}

function normalizeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizeDataBatchJobEvent(data: unknown): DataBatchJobEvent | null {
  if (!isRecord(data)) return null
  const tenantId = data['tenantId']
  const projectId = data['projectId']
  const jobId = data['jobId']
  const status = data['status']
  if (typeof tenantId !== 'string' || typeof projectId !== 'string' || typeof jobId !== 'string' || typeof status !== 'string') return null
  const event: DataBatchJobEvent = {
    tenantId,
    projectId,
    jobId,
    status,
    completed: normalizeNumber(data['completed']),
    total: normalizeNumber(data['total']),
    timestamp: normalizeTimestamp(data['timestamp']),
  }
  if ('result' in data) event.result = data['result']
  if (typeof data['error'] === 'string') event.error = data['error']
  return event
}

function normalizeDataChangeEvent(data: unknown): DataChangeEvent | null {
  if (!isRecord(data)) return null
  const tenantId = data['tenantId']
  const projectId = data['projectId']
  const tableName = data['tableName']
  const operation = data['operation']
  if (typeof tenantId !== 'string' || typeof projectId !== 'string' || typeof tableName !== 'string' || typeof operation !== 'string') return null
  const event: DataChangeEvent = {
    tenantId,
    projectId,
    tableName,
    operation,
    timestamp: normalizeTimestamp(data['timestamp']),
  }
  if (typeof data['jobId'] === 'string') event.jobId = data['jobId']
  return event
}

function normalizeNotificationEvent(data: unknown): ServerNotificationEvent | null {
  if (!isRecord(data)) return null
  const message = readRequiredString(data, 'message')
  if (message === null) return null
  const event: ServerNotificationEvent = {
    title: readOptionalString(data, 'title') ?? '通知',
    message,
    timestamp: normalizeTimestamp(data['timestamp']),
  }
  const notificationId = readOptionalString(data, 'notificationId') ?? readOptionalString(data, 'id')
  const level = readOptionalString(data, 'level')
  const category = readOptionalString(data, 'category')
  const source = readOptionalString(data, 'source')
  const actionUrl = readOptionalString(data, 'actionUrl') ?? readOptionalString(data, 'url')
  if (notificationId !== undefined) event.notificationId = notificationId
  if (level !== undefined) event.level = level
  if (category !== undefined) event.category = category
  if (source !== undefined) event.source = source
  if (actionUrl !== undefined) event.actionUrl = actionUrl
  return event
}

function readOptionalString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key]
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function readRequiredString(data: Record<string, unknown>, key: string): string | null {
  return readOptionalString(data, key) ?? null
}

function normalizeDebugRouteRequestEvent(data: unknown): DebugRouteRequestEvent | null {
  if (!isRecord(data)) return null
  const requestId = readRequiredString(data, 'requestId')
  if (requestId === null) return null
  const event: DebugRouteRequestEvent = {
    requestId,
    timestamp: normalizeTimestamp(data['timestamp']),
  }
  const path = readOptionalString(data, 'path')
  const pageId = readOptionalString(data, 'pageId')
  const tenantId = readOptionalString(data, 'tenantId')
  const projectId = readOptionalString(data, 'projectId')
  const reason = readOptionalString(data, 'reason')
  if (path !== undefined) event.path = path
  if (pageId !== undefined) event.pageId = pageId
  if (tenantId !== undefined) event.tenantId = tenantId
  if (projectId !== undefined) event.projectId = projectId
  if (typeof data['replace'] === 'boolean') event.replace = data['replace']
  if (reason !== undefined) event.reason = reason
  return event
}

function normalizeDebugScreenshotRequestEvent(data: unknown): DebugScreenshotRequestEvent | null {
  if (!isRecord(data)) return null
  const requestId = readRequiredString(data, 'requestId')
  if (requestId === null) return null
  const event: DebugScreenshotRequestEvent = {
    requestId,
    timestamp: normalizeTimestamp(data['timestamp']),
  }
  const selector = readOptionalString(data, 'selector')
  const pageId = readOptionalString(data, 'pageId')
  const reason = readOptionalString(data, 'reason')
  if (selector !== undefined) event.selector = selector
  if (pageId !== undefined) event.pageId = pageId
  if (reason !== undefined) event.reason = reason
  return event
}

function normalizeDebugRouteResultEvent(data: unknown): DebugRouteResultEvent | null {
  if (!isRecord(data)) return null
  const requestId = readRequiredString(data, 'requestId')
  const status = readRequiredString(data, 'status')
  if (requestId === null || status === null) return null
  const event: DebugRouteResultEvent = { requestId, status }
  const targetPath = readOptionalString(data, 'targetPath')
  const currentPath = readOptionalString(data, 'currentPath')
  const message = readOptionalString(data, 'message')
  if (typeof data['serverTimestamp'] === 'number') event.serverTimestamp = data['serverTimestamp']
  if (targetPath !== undefined) event.targetPath = targetPath
  if (currentPath !== undefined) event.currentPath = currentPath
  if (message !== undefined) event.message = message
  return event
}

function normalizeDebugScreenshotResultEvent(data: unknown): DebugScreenshotResultEvent | null {
  if (!isRecord(data)) return null
  const requestId = readRequiredString(data, 'requestId')
  const status = readRequiredString(data, 'status')
  if (requestId === null || status === null) return null
  const event: DebugScreenshotResultEvent = { requestId, status }
  const fileId = readOptionalString(data, 'fileId')
  const name = readOptionalString(data, 'name')
  const url = readOptionalString(data, 'url')
  const message = readOptionalString(data, 'message')
  const textDigest = readOptionalString(data, 'textDigest')
  if (typeof data['serverTimestamp'] === 'number') event.serverTimestamp = data['serverTimestamp']
  if (fileId !== undefined) event.fileId = fileId
  if (name !== undefined) event.name = name
  if (url !== undefined) event.url = url
  if (message !== undefined) event.message = message
  if (textDigest !== undefined) event.textDigest = textDigest
  return event
}

function normalizeDebugFcErrorReportEvent(data: unknown): DebugFcErrorReportEvent | null {
  if (!isRecord(data)) return null
  const reportId = readRequiredString(data, 'reportId')
  if (reportId === null) return null
  return {
    ...data,
    reportId,
    serverTimestamp: normalizeTimestamp(data['serverTimestamp']),
  }
}

// ─── 连接管理 ────────────────────────────────────────────────────────────────

/** 按事件类型存储的订阅回调集合 */
const _eventSubscribers = new Map<string, Set<(data: unknown) => void>>()
let _sharedEs: EventSource | null = null
let _retryCount = 0
const _MAX_RETRIES = 5
const SSE_URL = '/api/events'
const _legacyProtocolWarnings = new Set<string>()

/** 累计收到的畸形 SSE 事件数（作为可观测性计数器，由诊断工具读取）。 */
let _malformedEventCount = 0

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
  const es = new EventSource(SSE_URL)
  _sharedEs = es

  // 为已有订阅的事件类型注册 listener
  for (const eventType of _eventSubscribers.keys()) {
    _addEsListener(es, eventType)
  }

  es.onerror = () => {
    _retryCount++
    if (_retryCount > _MAX_RETRIES) {
      _teardown()
      logger.warn('已达最大重连次数，停止监听')
    }
  }
}

function _addEsListener(es: EventSource, eventType: string): void {
  const listener: EventListener = (event) => {
    _retryCount = 0
    try {
      if (!(event instanceof MessageEvent) || typeof event.data !== 'string') {
        throw new Error('SSE event payload must be a string')
      }
      const parsed: unknown = JSON.parse(event.data)
      const data = unwrapServerEventPayload(eventType, parsed)
      const subs = _eventSubscribers.get(eventType)
      if (subs) {
        for (const cb of subs) {
          cb(data)
        }
      }
    } catch (err) {
      _malformedEventCount += 1
      logger.warn('丢弃畸形事件', {
        eventType,
        totalMalformed: _malformedEventCount,
        error: errorMessage(err),
      })
    }
  }

  es.addEventListener(eventType, listener)
}

function unwrapServerEventPayload(eventType: string, payload: unknown): unknown {
  if (!isRecord(payload)) {
    warnLegacyProtocolOnce(eventType, 'plain')
    return payload
  }

  const isEnvelope = typeof payload['ok'] === 'boolean'
    && Object.prototype.hasOwnProperty.call(payload, 'data')
    && Object.prototype.hasOwnProperty.call(payload, 'error')

  if (!isEnvelope) {
    warnLegacyProtocolOnce(eventType, 'plain')
    return payload
  }

  const protocolVersion = payload['protocolVersion']
  if (protocolVersion !== 4) {
    warnLegacyProtocolOnce(eventType, typeof protocolVersion === 'number' ? `v${protocolVersion}` : 'legacy')
  }

  if (payload['ok'] === true) {
    return payload['data']
  }

  const error = isRecord(payload['error']) ? payload['error'] : null
  const message = typeof error?.['message'] === 'string' && error['message'].trim() !== ''
    ? error['message']
    : 'SSE server event failed'
  throw new Error(message)
}

function warnLegacyProtocolOnce(eventType: string, protocol: string): void {
  const key = `${eventType}:${protocol}`
  if (_legacyProtocolWarnings.has(key)) return
  _legacyProtocolWarnings.add(key)
  logger.warn('收到旧版 SSE 事件载荷，已走兼容解包路径', { eventType, protocol })
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
export function onServerEvent(
  eventType: string,
  callback: (data: unknown) => void,
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
  subs.add(callback)
  _ensureConnection()

  return () => {
    subs.delete(callback)
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
  return onServerEvent(ServerEventType.PAGE_CONFIG, (data) => {
    const event = normalizeFileChangeEvent(data)
    if (event === null) {
      _malformedEventCount += 1
      logger.warn('丢弃畸形页面配置事件', {
        totalMalformed: _malformedEventCount,
      })
      return
    }
    callback(event)
  })
}

/**
 * 监听多表异步数据任务状态。
 */
export function onDataBatchJob(
  callback: (event: DataBatchJobEvent) => void,
): () => void {
  return onServerEvent(ServerEventType.DATA_BATCH_JOB, (data) => {
    const event = normalizeDataBatchJobEvent(data)
    if (event === null) {
      _malformedEventCount += 1
      logger.warn('丢弃畸形数据任务事件', {
        totalMalformed: _malformedEventCount,
      })
      return
    }
    callback(event)
  })
}

/**
 * 监听元数据驱动表的数据变更事件。
 */
export function onDataChange(
  callback: (event: DataChangeEvent) => void,
): () => void {
  return onServerEvent(ServerEventType.DATA_CHANGE, (data) => {
    const event = normalizeDataChangeEvent(data)
    if (event === null) {
      _malformedEventCount += 1
      logger.warn('丢弃畸形数据变更事件', {
        totalMalformed: _malformedEventCount,
      })
      return
    }
    callback(event)
  })
}

/**
 * 监听 APP 通知事件。
 */
export function onNotificationEvent(
  callback: (event: ServerNotificationEvent) => void,
): () => void {
  return onServerEvent(ServerEventType.NOTIFICATION, (data) => {
    const event = normalizeNotificationEvent(data)
    if (event === null) {
      _malformedEventCount += 1
      logger.warn('丢弃畸形通知事件', {
        totalMalformed: _malformedEventCount,
      })
      return
    }
    callback(event)
  })
}

/**
 * 监听 AI 调试路由请求。
 */
export function onDebugRouteRequest(
  callback: (event: DebugRouteRequestEvent) => void,
): () => void {
  return onServerEvent(ServerEventType.DEBUG_ROUTE_REQUEST, (data) => {
    const event = normalizeDebugRouteRequestEvent(data)
    if (event === null) {
      _malformedEventCount += 1
      logger.warn('丢弃畸形 AI 调试路由请求事件', {
        totalMalformed: _malformedEventCount,
      })
      return
    }
    callback(event)
  })
}

/**
 * 监听 AI 调试截图请求。
 */
export function onDebugScreenshotRequest(
  callback: (event: DebugScreenshotRequestEvent) => void,
): () => void {
  return onServerEvent(ServerEventType.DEBUG_SCREENSHOT_REQUEST, (data) => {
    const event = normalizeDebugScreenshotRequestEvent(data)
    if (event === null) {
      _malformedEventCount += 1
      logger.warn('丢弃畸形 AI 调试截图请求事件', {
        totalMalformed: _malformedEventCount,
      })
      return
    }
    callback(event)
  })
}

/**
 * 监听 AI 调试路由回执。
 */
export function onDebugRouteResult(
  callback: (event: DebugRouteResultEvent) => void,
): () => void {
  return onServerEvent(ServerEventType.DEBUG_ROUTE_RESULT, (data) => {
    const event = normalizeDebugRouteResultEvent(data)
    if (event === null) {
      _malformedEventCount += 1
      logger.warn('丢弃畸形 AI 调试路由回执事件', {
        totalMalformed: _malformedEventCount,
      })
      return
    }
    callback(event)
  })
}

/**
 * 监听 AI 调试截图回执。
 */
export function onDebugScreenshotResult(
  callback: (event: DebugScreenshotResultEvent) => void,
): () => void {
  return onServerEvent(ServerEventType.DEBUG_SCREENSHOT_RESULT, (data) => {
    const event = normalizeDebugScreenshotResultEvent(data)
    if (event === null) {
      _malformedEventCount += 1
      logger.warn('丢弃畸形 AI 调试截图回执事件', {
        totalMalformed: _malformedEventCount,
      })
      return
    }
    callback(event)
  })
}

/**
 * 监听前端 FC 错误诊断事件。
 */
export function onDebugFcErrorReport(
  callback: (event: DebugFcErrorReportEvent) => void,
): () => void {
  return onServerEvent(ServerEventType.DEBUG_FC_ERROR_REPORT, (data) => {
    const event = normalizeDebugFcErrorReportEvent(data)
    if (event === null) {
      _malformedEventCount += 1
      logger.warn('丢弃畸形 AI 调试 FC 错误事件', {
        totalMalformed: _malformedEventCount,
      })
      return
    }
    callback(event)
  })
}
