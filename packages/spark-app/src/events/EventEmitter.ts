/**
 * 简化的事件发射器基类
 * 每个包内独立实现，避免跨包依赖问题
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventHandler = (...args: any[]) => void

/**
 * 通用事件发射器
 */
export class EventEmitter<EventMap extends Record<string, EventHandler> = Record<string, EventHandler>> {
  private listeners = new Map<keyof EventMap, Set<EventHandler>>()

  /**
   * 监听事件
   * @returns 取消监听的函数
   */
  on<K extends keyof EventMap>(event: K, handler: EventMap[K]): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.add(handler as EventHandler)
    }

    return () => this.off(event, handler)
  }

  /**
   * 一次性监听
   * @returns 取消监听的函数
   */
  once<K extends keyof EventMap>(event: K, handler: EventMap[K]): () => void {
    const wrapper = ((...args: unknown[]) => {
      this.off(event, wrapper as EventMap[K])
      ;(handler as EventHandler)(...args)
    }) as EventMap[K]

    return this.on(event, wrapper)
  }

  /**
   * 取消监听
   */
  off<K extends keyof EventMap>(event: K, handler?: EventMap[K]): void {
    if (!handler) {
      this.listeners.delete(event)
      return
    }

    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.delete(handler as EventHandler)
      if (handlers.size === 0) {
        this.listeners.delete(event)
      }
    }
  }

  /**
   * 发射事件
   */
  emit<K extends keyof EventMap>(
    event: K,
    ...args: Parameters<EventMap[K]>
  ): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(...args)
        } catch (error) {
          console.error(`[EventEmitter] Error in handler for "${String(event)}":`, error)
        }
      })
    }
  }

  /**
   * 获取事件监听器数量
   */
  listenerCount<K extends keyof EventMap>(event: K): number {
    return this.listeners.get(event)?.size ?? 0
  }

  /**
   * 清空所有监听器
   */
  removeAllListeners(): void {
    this.listeners.clear()
  }

  /**
   * 获取所有事件名
   */
  eventNames(): Array<keyof EventMap> {
    return Array.from(this.listeners.keys())
  }
}
