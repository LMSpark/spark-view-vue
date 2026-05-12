import { computed, reactive, onBeforeUnmount } from 'vue'
import {
  onPageConfigChange,
  type PageConfigFileChangeEvent,
} from '@spark-view/spark-page-config/services'

export interface NotificationItem {
  id: number
  title: string
  message: string
  time: number
  read: boolean
}

/** 模块级状态（单例共享） */
const notifications = reactive<NotificationItem[]>([])
let _nextId = 1
let _unsubscribe: (() => void) | null = null
let _refCount = 0

const MAX_NOTIFICATIONS = 50

function formatFileLabel(file: string): string {
  return file
}

function connect(): void {
  if (_unsubscribe) return
  _unsubscribe = onPageConfigChange((event: PageConfigFileChangeEvent) => {
    const item: NotificationItem = {
      id: _nextId++,
      title: `页面配置变更`,
      message: `${event.pageId} / ${formatFileLabel(event.file)}`,
      time: event.timestamp,
      read: false,
    }
    notifications.unshift(item)
    // 超限裁剪
    if (notifications.length > MAX_NOTIFICATIONS) {
      notifications.splice(MAX_NOTIFICATIONS)
    }
  })
}

function disconnect(): void {
  _unsubscribe?.()
  _unsubscribe = null
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
