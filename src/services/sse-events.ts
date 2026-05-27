/**
 * APP 公共 SSE 事件总线。
 *
 * 本文件只维护 `/api/events` 的单例连接、v4 envelope 解包和按事件名分发。
 * 页面配置、数据任务、通知、AI 调试等业务动作在各自订阅方处理。
 */

import { Logger, isRecord, type ApiEnvelopeContext, type ApiEnvelopeEvent } from '@spark-view/spark-utils'
import { readNonEmptyStringProperty } from '@spark-view/spark-utils/internal'
import type {
  AiAgentAppSseEvent,
  AiAgentAppSseEventName,
  AiAgentAppSseEventSource,
} from '@spark-view/spark-ai/agent'

const logger = Logger('SSE')

// Event names ---------------------------------------------------------------

const ServerEventType = Object.freeze({
  PAGE_CONFIG: 'page-config',
  DATA_BATCH_JOB: 'data-batch-job',
  DATA_CHANGE: 'data-change',
  NOTIFICATION: 'notification',
  DEBUG_ROUTE_REQUEST: 'debug-route-request',
  DEBUG_ROUTE_RESULT: 'debug-route-result',
  DEBUG_SCREENSHOT_REQUEST: 'debug-screenshot-request',
  DEBUG_SCREENSHOT_RESULT: 'debug-screenshot-result',
  DEBUG_FC_ERROR_REPORT: 'debug-fc-error-report',
})

// Payload contracts ---------------------------------------------------------

export type FileChangeEvent = {
  pageId: string
  file: string
  timestamp: number
}

export type DataBatchJobEvent = {
  tenantId: string
  projectId: string
  jobId: string
  status: string
  completed: number
  total: number
  timestamp: number
  result?: unknown
  error?: string
}

export type DataChangeEvent = {
  tenantId: string
  projectId: string
  tableName: string
  operation: string
  timestamp: number
  jobId?: string
}

export type ServerNotificationEvent = {
  title: string
  message: string
  timestamp: number
  notificationId?: string
  level?: string
  category?: string
  source?: string
  actionUrl?: string
}

export type DebugRouteRequestEvent = {
  requestId: string
  timestamp: number
  path?: string
  pageId?: string
  tenantId?: string
  projectId?: string
  replace?: boolean
  reason?: string
}

export type DebugRouteResultEvent = {
  requestId: string
  status: string
  serverTimestamp?: number
  targetPath?: string
  currentPath?: string
  message?: string
}

export type DebugScreenshotRequestEvent = {
  requestId: string
  timestamp: number
  selector?: string
  pageId?: string
  reason?: string
}

export type DebugScreenshotResultEvent = {
  requestId: string
  status: string
  serverTimestamp?: number
  fileId?: string
  name?: string
  url?: string
  message?: string
  textDigest?: string
}

export type DebugFcErrorReportEvent = {
  reportId: string
  serverTimestamp: number
  [key: string]: unknown
}

type EventNormalizer<T> = (data: unknown) => T | null

// Shared connection state ---------------------------------------------------

const SSE_URL = '/api/events'
const MAX_RETRIES = 5

const eventSubscribers = new Map<string, Set<(data: unknown) => void>>()
const envelopeEventSubscribers = new Map<string, Set<(event: AiAgentAppSseEvent) => void>>()
const eventListeners = new Map<string, EventListener>()
const legacyProtocolWarnings = new Set<string>()

let sharedEventSource: EventSource | null = null
let retryCount = 0

/** 畸形事件计数保留在模块内，方便诊断日志定位协议接入质量。 */
let malformedEventCount = 0

// Public subscription API ---------------------------------------------------

export function onServerEvent(
  eventType: string,
  callback: (data: unknown) => void,
): () => void {
  let subscribers = eventSubscribers.get(eventType)
  if (subscribers === undefined) {
    subscribers = new Set()
    eventSubscribers.set(eventType, subscribers)
  }
  subscribers.add(callback)

  ensureConnection()
  if (sharedEventSource !== null) {
    addEventSourceListener(sharedEventSource, eventType)
  }

  return () => {
    subscribers.delete(callback)
    if (subscribers.size === 0) {
      eventSubscribers.delete(eventType)
    }
    if (totalSubscribers() === 0) {
      teardownConnection()
    }
  }
}

export function onServerEnvelopeEvent(
  eventType: AiAgentAppSseEventName,
  callback: (event: AiAgentAppSseEvent) => void,
): () => void {
  const eventKey = String(eventType)
  let subscribers = envelopeEventSubscribers.get(eventKey)
  if (subscribers === undefined) {
    subscribers = new Set()
    envelopeEventSubscribers.set(eventKey, subscribers)
  }
  subscribers.add(callback)

  ensureConnection()
  if (sharedEventSource !== null) {
    addEventSourceListener(sharedEventSource, eventKey)
  }

  return () => {
    subscribers.delete(callback)
    if (subscribers.size === 0) {
      envelopeEventSubscribers.delete(eventKey)
    }
    if (totalSubscribers() === 0) {
      teardownConnection()
    }
  }
}

export function createAppSseEventSource(): AiAgentAppSseEventSource {
  return {
    on: onServerEnvelopeEvent,
  }
}

export function onPageConfigChange(
  callback: (event: FileChangeEvent) => void,
): () => void {
  return onTypedServerEvent({
    eventType: ServerEventType.PAGE_CONFIG,
    normalize: normalizeFileChangeEvent,
    label: '页面配置',
    callback,
  })
}

export function onDataBatchJob(
  callback: (event: DataBatchJobEvent) => void,
): () => void {
  return onTypedServerEvent({
    eventType: ServerEventType.DATA_BATCH_JOB,
    normalize: normalizeDataBatchJobEvent,
    label: '数据任务',
    callback,
  })
}

export function onDataChange(
  callback: (event: DataChangeEvent) => void,
): () => void {
  return onTypedServerEvent({
    eventType: ServerEventType.DATA_CHANGE,
    normalize: normalizeDataChangeEvent,
    label: '数据变更',
    callback,
  })
}

export function onNotificationEvent(
  callback: (event: ServerNotificationEvent) => void,
): () => void {
  return onTypedServerEvent({
    eventType: ServerEventType.NOTIFICATION,
    normalize: normalizeNotificationEvent,
    label: '通知',
    callback,
  })
}

export function onDebugRouteRequest(
  callback: (event: DebugRouteRequestEvent) => void,
): () => void {
  return onTypedServerEvent({
    eventType: ServerEventType.DEBUG_ROUTE_REQUEST,
    normalize: normalizeDebugRouteRequestEvent,
    label: 'AI 调试路由请求',
    callback,
  })
}

export function onDebugRouteResult(
  callback: (event: DebugRouteResultEvent) => void,
): () => void {
  return onTypedServerEvent({
    eventType: ServerEventType.DEBUG_ROUTE_RESULT,
    normalize: normalizeDebugRouteResultEvent,
    label: 'AI 调试路由回执',
    callback,
  })
}

export function onDebugScreenshotRequest(
  callback: (event: DebugScreenshotRequestEvent) => void,
): () => void {
  return onTypedServerEvent({
    eventType: ServerEventType.DEBUG_SCREENSHOT_REQUEST,
    normalize: normalizeDebugScreenshotRequestEvent,
    label: 'AI 调试截图请求',
    callback,
  })
}

export function onDebugScreenshotResult(
  callback: (event: DebugScreenshotResultEvent) => void,
): () => void {
  return onTypedServerEvent({
    eventType: ServerEventType.DEBUG_SCREENSHOT_RESULT,
    normalize: normalizeDebugScreenshotResultEvent,
    label: 'AI 调试截图回执',
    callback,
  })
}

export function onDebugFcErrorReport(
  callback: (event: DebugFcErrorReportEvent) => void,
): () => void {
  return onTypedServerEvent({
    eventType: ServerEventType.DEBUG_FC_ERROR_REPORT,
    normalize: normalizeDebugFcErrorReportEvent,
    label: 'AI 调试 FC 错误',
    callback,
  })
}

// Connection lifecycle ------------------------------------------------------

function ensureConnection(): void {
  if (sharedEventSource !== null) return

  retryCount = 0
  const eventSource = new EventSource(SSE_URL)
  sharedEventSource = eventSource

  for (const eventType of eventSubscribers.keys()) {
    addEventSourceListener(eventSource, eventType)
  }

  eventSource.onerror = () => {
    retryCount += 1
    if (retryCount <= MAX_RETRIES) return
    teardownConnection()
    logger.warn('已达最大重连次数，停止监听 APP SSE')
  }
}

function addEventSourceListener(eventSource: EventSource, eventType: string): void {
  if (eventListeners.has(eventType)) return

  const listener: EventListener = (event) => {
    retryCount = 0
    try {
      dispatchMessageEvent(eventType, event)
    } catch (error: unknown) {
      malformedEventCount += 1
      logger.warn('丢弃畸形 SSE 事件', {
        eventType,
        totalMalformed: malformedEventCount,
        error: errorMessage(error),
      })
    }
  }

  eventListeners.set(eventType, listener)
  eventSource.addEventListener(eventType, listener)
}

function dispatchMessageEvent(eventType: string, event: Event): void {
  if (!(event instanceof MessageEvent) || typeof event.data !== 'string') {
    throw new Error('SSE event payload must be a string')
  }

  const parsed: unknown = JSON.parse(event.data)
  const envelopeEvent = normalizeServerEnvelopeEvent(eventType, event.data, parsed)
  dispatchEnvelopeEvent(eventType, envelopeEvent)

  if (!eventSubscribers.has(eventType)) return
  const data = unwrapServerEventPayload(eventType, parsed)
  const subscribers = eventSubscribers.get(eventType)
  if (subscribers === undefined) return

  for (const callback of subscribers) {
    callback(data)
  }
}

function teardownConnection(): void {
  sharedEventSource?.close()
  sharedEventSource = null
  eventListeners.clear()
}

function totalSubscribers(): number {
  let count = 0
  for (const subscribers of eventSubscribers.values()) {
    count += subscribers.size
  }
  for (const subscribers of envelopeEventSubscribers.values()) {
    count += subscribers.size
  }
  return count
}

// Envelope compatibility ----------------------------------------------------

function unwrapServerEventPayload(eventType: string, payload: unknown): unknown {
  if (!isRecord(payload)) {
    warnLegacyProtocolOnce(eventType, 'plain')
    return payload
  }

  if (!isEnvelopeLike(payload)) {
    warnLegacyProtocolOnce(eventType, 'plain')
    return payload
  }

  const protocolVersion = payload['protocolVersion']
  if (protocolVersion !== 4) {
    warnLegacyProtocolOnce(eventType, typeof protocolVersion === 'number' ? `v${protocolVersion}` : 'legacy')
  }

  validateEnvelopeEventName(eventType, payload)

  if (payload['ok'] === true) {
    return payload['data']
  }

  throw new Error(readEnvelopeErrorMessage(payload))
}

function dispatchEnvelopeEvent(eventType: string, event: AiAgentAppSseEvent): void {
  const subscribers = envelopeEventSubscribers.get(eventType)
  if (subscribers === undefined) return

  for (const callback of subscribers) {
    callback(event)
  }
}

function normalizeServerEnvelopeEvent(
  eventType: string,
  rawData: string,
  payload: unknown,
): AiAgentAppSseEvent {
  if (!isRecord(payload) || !isEnvelopeLike(payload)) {
    return {
      name: eventType,
      ok: true,
      data: payload,
      rawData,
      rawPayload: payload,
    }
  }

  validateEnvelopeEventName(eventType, payload)
  const protocolVersion = payload['protocolVersion']
  const ok = payload['ok'] === true
  const context: ApiEnvelopeContext | undefined = isRecord(payload['context']) ? payload['context'] : undefined
  const envelopeEvent: ApiEnvelopeEvent | undefined = isRecord(payload['event']) ? payload['event'] : undefined
  return {
    name: eventType,
    ok,
    data: ok ? payload['data'] : (payload['error'] ?? payload),
    rawData,
    rawPayload: payload,
    ...(typeof protocolVersion === 'number' ? { protocolVersion } : {}),
    ...(context !== undefined ? { context } : {}),
    ...(envelopeEvent !== undefined ? { event: envelopeEvent } : {}),
  }
}

function isEnvelopeLike(payload: Record<string, unknown>): boolean {
  return (
    typeof payload['ok'] === 'boolean'
    && Object.prototype.hasOwnProperty.call(payload, 'data')
    && Object.prototype.hasOwnProperty.call(payload, 'error')
  )
}

function validateEnvelopeEventName(eventType: string, payload: Record<string, unknown>): void {
  const event = payload['event']
  if (!isRecord(event)) return

  const transport = event['transport']
  if (transport !== undefined && transport !== 'sse') {
    throw new Error(`SSE envelope transport mismatch: ${String(transport)}`)
  }

  const envelopeName = event['name']
  if (envelopeName !== undefined && envelopeName !== eventType) {
    throw new Error(`SSE event name mismatch: frame=${eventType}, envelope=${String(envelopeName)}`)
  }
}

function readEnvelopeErrorMessage(payload: Record<string, unknown>): string {
  const error = isRecord(payload['error']) ? payload['error'] : null
  return typeof error?.['message'] === 'string' && error['message'].trim() !== ''
    ? error['message']
    : 'SSE server event failed'
}

function warnLegacyProtocolOnce(eventType: string, protocol: string): void {
  const key = `${eventType}:${protocol}`
  if (legacyProtocolWarnings.has(key)) return
  legacyProtocolWarnings.add(key)
  logger.warn('收到旧版 SSE 事件载荷，已走兼容解包路径', { eventType, protocol })
}

// Typed event normalization -------------------------------------------------

type TypedServerEventSubscription<T> = Readonly<{
  eventType: string
  normalize: EventNormalizer<T>
  label: string
  callback: (event: T) => void
}>

function onTypedServerEvent<T>(subscription: TypedServerEventSubscription<T>): () => void {
  const { eventType, normalize, label, callback } = subscription
  return onServerEvent(eventType, (data) => {
    const event = normalize(data)
    if (event === null) {
      reportMalformedTypedEvent(label)
      return
    }
    callback(event)
  })
}

function reportMalformedTypedEvent(label: string): void {
  malformedEventCount += 1
  logger.warn(`丢弃畸形${label}事件`, {
    totalMalformed: malformedEventCount,
  })
}

function normalizeFileChangeEvent(data: unknown): FileChangeEvent | null {
  if (!isRecord(data)) return null

  const pageId = data['pageId']
  const file = data['file']
  if (typeof pageId !== 'string' || typeof file !== 'string') return null

  return {
    pageId,
    file,
    timestamp: normalizeTimestamp(data['timestamp']),
  }
}

function normalizeDataBatchJobEvent(data: unknown): DataBatchJobEvent | null {
  if (!isRecord(data)) return null

  const tenantId = data['tenantId']
  const projectId = data['projectId']
  const jobId = data['jobId']
  const status = data['status']
  if (
    typeof tenantId !== 'string'
    || typeof projectId !== 'string'
    || typeof jobId !== 'string'
    || typeof status !== 'string'
  ) {
    return null
  }

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
  if (
    typeof tenantId !== 'string'
    || typeof projectId !== 'string'
    || typeof tableName !== 'string'
    || typeof operation !== 'string'
  ) {
    return null
  }

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
    title: readNonEmptyStringProperty(data, 'title') ?? '通知',
    message,
    timestamp: normalizeTimestamp(data['timestamp']),
  }
  const notificationId = readNonEmptyStringProperty(data, 'notificationId') ?? readNonEmptyStringProperty(data, 'id')
  const level = readNonEmptyStringProperty(data, 'level')
  const category = readNonEmptyStringProperty(data, 'category')
  const source = readNonEmptyStringProperty(data, 'source')
  const actionUrl = readNonEmptyStringProperty(data, 'actionUrl') ?? readNonEmptyStringProperty(data, 'url')

  if (notificationId !== undefined) event.notificationId = notificationId
  if (level !== undefined) event.level = level
  if (category !== undefined) event.category = category
  if (source !== undefined) event.source = source
  if (actionUrl !== undefined) event.actionUrl = actionUrl
  return event
}

function normalizeDebugRouteRequestEvent(data: unknown): DebugRouteRequestEvent | null {
  if (!isRecord(data)) return null

  const requestId = readRequiredString(data, 'requestId')
  if (requestId === null) return null

  const event: DebugRouteRequestEvent = {
    requestId,
    timestamp: normalizeTimestamp(data['timestamp']),
  }
  const path = readNonEmptyStringProperty(data, 'path')
  const pageId = readNonEmptyStringProperty(data, 'pageId')
  const tenantId = readNonEmptyStringProperty(data, 'tenantId')
  const projectId = readNonEmptyStringProperty(data, 'projectId')
  const reason = readNonEmptyStringProperty(data, 'reason')

  if (path !== undefined) event.path = path
  if (pageId !== undefined) event.pageId = pageId
  if (tenantId !== undefined) event.tenantId = tenantId
  if (projectId !== undefined) event.projectId = projectId
  if (typeof data['replace'] === 'boolean') event.replace = data['replace']
  if (reason !== undefined) event.reason = reason
  return event
}

function normalizeDebugRouteResultEvent(data: unknown): DebugRouteResultEvent | null {
  if (!isRecord(data)) return null

  const requestId = readRequiredString(data, 'requestId')
  const status = readRequiredString(data, 'status')
  if (requestId === null || status === null) return null

  const event: DebugRouteResultEvent = { requestId, status }
  const targetPath = readNonEmptyStringProperty(data, 'targetPath')
  const currentPath = readNonEmptyStringProperty(data, 'currentPath')
  const message = readNonEmptyStringProperty(data, 'message')

  if (typeof data['serverTimestamp'] === 'number') event.serverTimestamp = data['serverTimestamp']
  if (targetPath !== undefined) event.targetPath = targetPath
  if (currentPath !== undefined) event.currentPath = currentPath
  if (message !== undefined) event.message = message
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
  const selector = readNonEmptyStringProperty(data, 'selector')
  const pageId = readNonEmptyStringProperty(data, 'pageId')
  const reason = readNonEmptyStringProperty(data, 'reason')

  if (selector !== undefined) event.selector = selector
  if (pageId !== undefined) event.pageId = pageId
  if (reason !== undefined) event.reason = reason
  return event
}

function normalizeDebugScreenshotResultEvent(data: unknown): DebugScreenshotResultEvent | null {
  if (!isRecord(data)) return null

  const requestId = readRequiredString(data, 'requestId')
  const status = readRequiredString(data, 'status')
  if (requestId === null || status === null) return null

  const event: DebugScreenshotResultEvent = { requestId, status }
  const fileId = readNonEmptyStringProperty(data, 'fileId')
  const name = readNonEmptyStringProperty(data, 'name')
  const url = readNonEmptyStringProperty(data, 'url')
  const message = readNonEmptyStringProperty(data, 'message')
  const textDigest = readNonEmptyStringProperty(data, 'textDigest')

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

// Scalar readers ------------------------------------------------------------


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


function readRequiredString(data: Record<string, unknown>, key: string): string | null {
  return readNonEmptyStringProperty(data, key) ?? null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
