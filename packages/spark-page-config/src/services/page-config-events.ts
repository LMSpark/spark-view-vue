import { Logger } from '@spark-view/spark-utils'

const logger = Logger('PageConfigEvents')

export const PageConfigServerEventType = {
  PAGE_CONFIG: 'page-config',
} as const

export type PageConfigServerEventTypeName =
  (typeof PageConfigServerEventType)[keyof typeof PageConfigServerEventType]

export interface PageConfigFileChangeEvent {
  pageId: string
  file: string
  timestamp: number
}

type ServerEventSubscriber = (data: unknown) => void

const eventSubscribers = new Map<string, Set<ServerEventSubscriber>>()
let sharedEventSource: EventSource | null = null
let retryCount = 0
const MAX_RETRIES = 5
let eventSourceUrl = '/api/events'
let malformedEventCount = 0

function normalizeFileChangeEvent(data: unknown): PageConfigFileChangeEvent | null {
  if (data === null || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  const pageId = record['pageId']
  const file = record['file']
  const timestamp = record['timestamp']
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

export function configurePageConfigEventSourceUrl(url: string): void {
  if (sharedEventSource) {
    teardown()
  }
  eventSourceUrl = url
}

function totalSubscribers(): number {
  let count = 0
  for (const set of eventSubscribers.values()) {
    count += set.size
  }
  return count
}

function ensureConnection(): void {
  if (sharedEventSource) return
  retryCount = 0
  const eventSource = new EventSource(eventSourceUrl)
  sharedEventSource = eventSource

  for (const eventType of eventSubscribers.keys()) {
    addEventSourceListener(eventSource, eventType)
  }

  eventSource.onerror = () => {
    retryCount += 1
    if (retryCount > MAX_RETRIES) {
      teardown()
      logger.warn('已达最大重连次数，停止监听')
    }
  }
}

function addEventSourceListener(eventSource: EventSource, eventType: string): void {
  eventSource.addEventListener(eventType, ((event: MessageEvent) => {
    retryCount = 0
    try {
      const data: unknown = JSON.parse(event.data as string)
      const subscribers = eventSubscribers.get(eventType)
      if (subscribers) {
        for (const callback of subscribers) {
          callback(data)
        }
      }
    } catch (error) {
      malformedEventCount += 1
      logger.warn('丢弃畸形事件', {
        eventType,
        totalMalformed: malformedEventCount,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }) as EventListener)
}

function teardown(): void {
  sharedEventSource?.close()
  sharedEventSource = null
}

export function onPageConfigServerEvent<T = unknown>(
  eventType: string,
  callback: (data: T) => void,
): () => void {
  let subscribers = eventSubscribers.get(eventType)
  if (!subscribers) {
    subscribers = new Set()
    eventSubscribers.set(eventType, subscribers)
    if (sharedEventSource) {
      addEventSourceListener(sharedEventSource, eventType)
    }
  }
  subscribers.add(callback as ServerEventSubscriber)
  ensureConnection()

  return () => {
    subscribers.delete(callback as ServerEventSubscriber)
    if (subscribers.size === 0) {
      eventSubscribers.delete(eventType)
    }
    if (totalSubscribers() === 0) {
      teardown()
    }
  }
}

export function onPageConfigChange(
  callback: (event: PageConfigFileChangeEvent) => void,
): () => void {
  return onPageConfigServerEvent<unknown>(PageConfigServerEventType.PAGE_CONFIG, (data) => {
    const event = normalizeFileChangeEvent(data)
    if (event === null) {
      malformedEventCount += 1
      logger.warn('丢弃畸形页面配置事件', {
        totalMalformed: malformedEventCount,
      })
      return
    }
    callback(event)
  })
}
