/**
 * @module app:services/sse-events
 * 职责：提供应用运行时 service 层的 sse events 能力，连接项目模型、AI Host、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
/**
 * APP 公共 SSE 事件总线。
 *
 * 本文件只维护 `/api/events` 的单例连接、v4 envelope 解包和按事件名分发。
 * 页面配置、数据任务、通知、AI Host Run 等业务动作在各自订阅方处理。
 */

import { Logger, isRecord, type ApiEnvelopeContext, type ApiEnvelopeEvent } from '@spark-appworks/spark-utils'
import { readNonEmptyStringProperty } from '@spark-appworks/spark-utils/internal'
import type {
  AiAgentAppSseEvent,
  AiAgentAppSseEventName,
  AiAgentAppSseEventSource,
} from '@spark-appworks/spark-ai/agent'

const logger = Logger('SSE')

// Event names ---------------------------------------------------------------

const ServerEventType = Object.freeze({
  PAGE_CONFIG: 'page-config',
  DATA_BATCH_JOB: 'data-batch-job',
  DATA_CHANGE: 'data-change',
  NOTIFICATION: 'notification',
  AI_HOST_RUN_REQUEST: 'ai-host-run-request',
  AI_HOST_RUN_RESULT: 'ai-host-run-result',
})

// Payload contracts ---------------------------------------------------------

/** File Change Event 的事件载荷。 */
export type FileChangeEvent = {
    /** page Id 标识。 */
pageId: string
    /** 文件路径或文件对象。 */
file: string
    /** 事件时间戳。 */
timestamp: number
}

/** Data Batch Job Event 的事件载荷。 */
export type DataBatchJobEvent = {
    /** tenant Id 标识。 */
tenantId: string
    /** project Id 标识。 */
projectId: string
    /** job Id 标识。 */
jobId: string
    /** 当前状态。 */
status: string
    /** completed 字段。 */
completed: number
    /** 总记录数。 */
total: number
    /** 事件时间戳。 */
timestamp: number
    /** 操作结果。 */
result?: unknown
    /** 错误对象或错误信息。 */
error?: string
}

/** Data Change Event 的事件载荷。 */
export type DataChangeEvent = {
    /** tenant Id 标识。 */
tenantId: string
    /** project Id 标识。 */
projectId: string
    /** 数据表名。 */
tableName: string
    /** operation 字段。 */
operation: string
    /** 事件时间戳。 */
timestamp: number
    /** job Id 标识。 */
jobId?: string
}

/** Server Notification Event 的事件载荷。 */
export type ServerNotificationEvent = {
    /** 显示标题。 */
title: string
    /** 用户可读消息。 */
message: string
    /** 事件时间戳。 */
timestamp: number
    /** notification Id 标识。 */
notificationId?: string
    /** level 字段。 */
level?: string
    /** category 字段。 */
category?: string
    /** 来源对象。 */
source?: string
    /** action Url 地址。 */
actionUrl?: string
}

/** Ai Host Run Request Event 的事件载荷。 */
export type AiHostRunRequestEvent = {
    /** request Id 标识。 */
requestId: string
    /** alias 字段。 */
alias: string
    /** args 字段。 */
args: Record<string, unknown>
    /** 事件时间戳。 */
timestamp: number
    /** timeout Ms 字段。 */
timeoutMs?: number
    /** reason 字段。 */
reason?: string
}

/** Ai Host Run Result Status 的语义模型。 */
export type AiHostRunResultStatus =
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'busy'
  | 'unknown_alias'
  | 'non_runnable'
  | 'invalid_args'
  | 'cancelled'

/** Ai Host Run Result Event 的事件载荷。 */
export type AiHostRunResultEvent = {
    /** request Id 标识。 */
requestId: string
    /** alias 字段。 */
alias: string
    /** 当前状态。 */
status: AiHostRunResultStatus
    /** duration Ms 字段。 */
durationMs?: number
    /** client Timestamp 字段。 */
clientTimestamp?: number
    /** server Timestamp 字段。 */
serverTimestamp?: number
    /** session Id 标识。 */
sessionId?: string
    /** business Registration Id 标识。 */
businessRegistrationId?: string
    /** business Instance Id 标识。 */
businessInstanceId?: string
    /** 展示文本。 */
text?: string
    /** reasoning 字段。 */
reasoning?: string
    /** tool Calls 字段。 */
toolCalls?: unknown
    /** 错误对象或错误信息。 */
error?: unknown
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

const DEFAULT_APP_SSE_READY_TIMEOUT_MS = 15_000

/**
 * 等待浏览器侧 `/api/events` 单例连接进入 OPEN。
 * Host Run / AI turn 下发前必须先就绪，否则后端会返回 APP_SSE_NOT_CONNECTED。
 */
export function waitForAppSseConnection(timeoutMs = DEFAULT_APP_SSE_READY_TIMEOUT_MS): Promise<void> {
  ensureConnection()
  let eventSource = sharedEventSource
  if (eventSource === null) {
    return Promise.reject(new Error('APP SSE connection was not initialized.'))
  }
  if (eventSource.readyState === EventSource.CLOSED) {
    teardownConnection()
    ensureConnection()
    eventSource = sharedEventSource
    if (eventSource === null) {
      return Promise.reject(new Error('APP SSE connection was not initialized.'))
    }
  }
  if (eventSource.readyState === EventSource.OPEN) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const activeSource = sharedEventSource
    if (activeSource === null) {
      reject(new Error('APP SSE connection was not initialized.'))
      return
    }

    const timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for APP SSE connection (${timeoutMs}ms).`))
    }, timeoutMs)

    const onOpen = (): void => {
      cleanup()
      resolve()
    }

    const cleanup = (): void => {
      window.clearTimeout(timeoutId)
      activeSource.removeEventListener('open', onOpen)
    }

    activeSource.addEventListener('open', onOpen)
  })
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

export function onAiHostRunRequest(
  callback: (event: AiHostRunRequestEvent) => void,
): () => void {
  return onTypedServerEvent({
    eventType: ServerEventType.AI_HOST_RUN_REQUEST,
    normalize: normalizeAiHostRunRequestEvent,
    label: 'AI Host Run 请求',
    callback,
  })
}

export function onAiHostRunResult(
  callback: (event: AiHostRunResultEvent) => void,
): () => void {
  return onTypedServerEvent({
    eventType: ServerEventType.AI_HOST_RUN_RESULT,
    normalize: normalizeAiHostRunResultEvent,
    label: 'AI Host Run 回执',
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
  const ok = payload['ok']
  const hasData = Object.prototype.hasOwnProperty.call(payload, 'data')
  const hasError = Object.prototype.hasOwnProperty.call(payload, 'error')
  return (
    typeof ok === 'boolean'
    && (ok ? hasData : hasError)
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

function normalizeAiHostRunRequestEvent(data: unknown): AiHostRunRequestEvent | null {
  if (!isRecord(data)) return null

  const requestId = readRequiredString(data, 'requestId')
  const alias = readRequiredString(data, 'alias')
  const args = isRecord(data['args']) ? data['args'] : null
  if (requestId === null || alias === null || args === null) return null

  const event: AiHostRunRequestEvent = {
    requestId,
    alias,
    args,
    timestamp: normalizeTimestamp(data['timestamp']),
  }
  const timeoutMs = normalizePositiveNumber(data['timeoutMs'])
  const reason = readNonEmptyStringProperty(data, 'reason')

  if (timeoutMs !== undefined) event.timeoutMs = timeoutMs
  if (reason !== undefined) event.reason = reason
  return event
}

function normalizeAiHostRunResultEvent(data: unknown): AiHostRunResultEvent | null {
  if (!isRecord(data)) return null

  const requestId = readRequiredString(data, 'requestId')
  const alias = readRequiredString(data, 'alias')
  const status = readAiHostRunStatus(data['status'])
  if (requestId === null || alias === null || status === null) return null

  const event: AiHostRunResultEvent = {
    requestId,
    alias,
    status,
  }
  const durationMs = normalizePositiveNumber(data['durationMs'])
  const clientTimestamp = normalizeOptionalTimestamp(data['clientTimestamp'])
  const serverTimestamp = normalizeOptionalTimestamp(data['serverTimestamp'])
  const sessionId = readNonEmptyStringProperty(data, 'sessionId')
  const businessRegistrationId = readNonEmptyStringProperty(data, 'businessRegistrationId')
  const businessInstanceId = readNonEmptyStringProperty(data, 'businessInstanceId')
  const text = readNonEmptyStringProperty(data, 'text')
  const reasoning = readNonEmptyStringProperty(data, 'reasoning')

  if (durationMs !== undefined) event.durationMs = durationMs
  if (clientTimestamp !== undefined) event.clientTimestamp = clientTimestamp
  if (serverTimestamp !== undefined) event.serverTimestamp = serverTimestamp
  if (sessionId !== undefined) event.sessionId = sessionId
  if (businessRegistrationId !== undefined) event.businessRegistrationId = businessRegistrationId
  if (businessInstanceId !== undefined) event.businessInstanceId = businessInstanceId
  if (text !== undefined) event.text = text
  if (reasoning !== undefined) event.reasoning = reasoning
  if ('toolCalls' in data) event.toolCalls = data['toolCalls']
  if ('error' in data) event.error = data['error']
  return event
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

function normalizePositiveNumber(value: unknown): number | undefined {
  const number = normalizeNumber(value, Number.NaN)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function normalizeOptionalTimestamp(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined
  return normalizeTimestamp(value)
}

function readAiHostRunStatus(value: unknown): AiHostRunResultStatus | null {
  if (typeof value !== 'string') return null
  switch (value) {
    case 'completed':
    case 'failed':
    case 'timeout':
    case 'busy':
    case 'unknown_alias':
    case 'non_runnable':
    case 'invalid_args':
    case 'cancelled':
      return value
    default:
      return null
  }
}

function readRequiredString(data: Record<string, unknown>, key: string): string | null {
  return readNonEmptyStringProperty(data, key) ?? null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
