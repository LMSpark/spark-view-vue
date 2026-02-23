import type { EventContext } from './types'

// 简易同步上下文管理器（类似 AsyncLocalStorage）
let currentEventContext: EventContext | null = null

export function withEventContext<T>(context: EventContext, fn: () => T): T {
  const prev = currentEventContext
  currentEventContext = context
  try {
    return fn()
  } finally {
    currentEventContext = prev
  }
}

export function getCurrentEventContext(): EventContext | null {
  return currentEventContext
}
