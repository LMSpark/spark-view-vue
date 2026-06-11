/**
 * @module app:composables/useNotifications
 * app 的 composables/useNotifications 模块。
 * 导出 ClassModel symbol: NotificationItem（共 1 个 symbol）。
 */
import { computed, onBeforeUnmount, reactive } from 'vue'
import { onNotificationEvent, onPageConfigChange } from '@/services/sse-events'
import type { FileChangeEvent, ServerNotificationEvent } from '@/services/sse-events'

/** Notification Item 的语义模型。 */
export type NotificationItem = {
    /** 唯一标识。 */
id: number
    /** 显示标题。 */
title: string
    /** 用户可读消息。 */
message: string
    /** time 字段。 */
time: number
    /** read 字段。 */
read: boolean
    /** remote Id 标识。 */
remoteId?: string
    /** level 字段。 */
level?: string
    /** category 字段。 */
category?: string
    /** 来源对象。 */
source?: string
    /** action Url 地址。 */
actionUrl?: string
}

const MAX_NOTIFICATIONS = 50

// Shared notification state -------------------------------------------------

const notifications = reactive<NotificationItem[]>([])

let nextId = 1
let refCount = 0
let unsubscribers: Array<() => void> = []

// Event adapters ------------------------------------------------------------

function createServerNotificationItem(event: ServerNotificationEvent): NotificationItem {
  const item: NotificationItem = {
    id: nextId++,
    title: event.title,
    message: event.message,
    time: event.timestamp,
    read: false,
  }
  if (event.notificationId !== undefined) item.remoteId = event.notificationId
  if (event.level !== undefined) item.level = event.level
  if (event.category !== undefined) item.category = event.category
  if (event.source !== undefined) item.source = event.source
  if (event.actionUrl !== undefined) item.actionUrl = event.actionUrl
  return item
}

function createPageConfigNotificationItem(event: FileChangeEvent): NotificationItem {
  return {
    id: nextId++,
    title: '页面配置变更',
    message: `${event.pageId} / ${event.file}`,
    time: event.timestamp,
    read: false,
    category: 'page-config',
    source: 'sse',
  }
}

function pushNotification(item: NotificationItem): void {
  notifications.unshift(item)
  if (notifications.length > MAX_NOTIFICATIONS) {
    notifications.splice(MAX_NOTIFICATIONS)
  }
}

// SSE lifecycle -------------------------------------------------------------

function connect(): void {
  if (unsubscribers.length > 0) return
  unsubscribers = [
    onNotificationEvent((event) => {
      pushNotification(createServerNotificationItem(event))
    }),
    onPageConfigChange((event) => {
      pushNotification(createPageConfigNotificationItem(event))
    }),
  ]
}

function disconnect(): void {
  for (const unsubscribe of unsubscribers) {
    unsubscribe()
  }
  unsubscribers = []
}

// Public composable ---------------------------------------------------------

export function useNotifications() {
  refCount += 1
  connect()

  onBeforeUnmount(() => {
    refCount -= 1
    if (refCount <= 0) {
      refCount = 0
      disconnect()
    }
  })

  const unreadCount = computed(() => notifications.filter(item => !item.read).length)

  function markRead(id: number): void {
    const item = notifications.find(candidate => candidate.id === id)
    if (item) item.read = true
  }

  function markAllRead(): void {
    for (const item of notifications) {
      item.read = true
    }
  }

  function clearAll(): void {
    notifications.splice(0)
  }

  function removeItem(id: number): void {
    const index = notifications.findIndex(item => item.id === id)
    if (index >= 0) notifications.splice(index, 1)
  }

  return {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    clearAll,
    removeItem,
  }
}
