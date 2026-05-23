import { computed, reactive, onBeforeUnmount } from 'vue'
import { onNotificationEvent, onPageConfigChange } from '@/services/sse-events'
import type { FileChangeEvent, ServerNotificationEvent } from '@/services/sse-events'

export type NotificationItem = {
  id: number
  title: string
  message: string
  time: number
  read: boolean
  remoteId?: string
  level?: string
  category?: string
  source?: string
  actionUrl?: string}

/** 模块级状态（单例共享） */
const notifications = reactive<NotificationItem[]>([])
let _nextId = 1
let _unsubscribers: Array<() => void> = []
let _refCount = 0

const MAX_NOTIFICATIONS = 50

function pushNotification(item: NotificationItem): void {
  notifications.unshift(item)
  if (notifications.length > MAX_NOTIFICATIONS) {
    notifications.splice(MAX_NOTIFICATIONS)
  }
}

function createNotificationItem(event: ServerNotificationEvent): NotificationItem {
  const item: NotificationItem = {
    id: _nextId++,
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

function connect(): void {
  if (_unsubscribers.length > 0) return
  _unsubscribers = [
    onNotificationEvent((event) => {
      pushNotification(createNotificationItem(event))
    }),
    onPageConfigChange((event: FileChangeEvent) => {
      pushNotification({
        id: _nextId++,
        title: '页面配置变更',
        message: `${event.pageId} / ${event.file}`,
        time: event.timestamp,
        read: false,
        category: 'page-config',
        source: 'sse',
      })
    }),
  ]
}

function disconnect(): void {
  for (const unsubscribe of _unsubscribers) {
    unsubscribe()
  }
  _unsubscribers = []
}

export function useNotifications() {
  _refCount++
  connect()

  onBeforeUnmount(() => {
    _refCount--
    if (_refCount <= 0) {
      _refCount = 0
      disconnect()
    }
  })

  const unreadCount = computed(() => notifications.filter(n => !n.read).length)

  function markRead(id: number): void {
    const item = notifications.find(n => n.id === id)
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
    const idx = notifications.findIndex(n => n.id === id)
    if (idx >= 0) notifications.splice(idx, 1)
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
