/**
 * EventEmitter 基类
 * 提供类型安全的事件发布/订阅机制
 */

export type EventHandler<T extends unknown[] = unknown[]> = (...args: T) => void

export interface EventMap {
  [event: string]: EventHandler
}

export class EventEmitter<Events extends EventMap = EventMap> {
  private listeners = new Map<keyof Events, Set<Events[keyof Events]>>()

  /**
   * 监听事件
   */
  on<K extends keyof Events>(event: K, handler: Events[K]): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    const listeners = this.listeners.get(event)
    if (listeners) {
      // 类型安全：Set 直接存储正确的事件处理器类型
      listeners.add(handler)
    }

    // 返回取消监听函数
    return () => this.off(event, handler)
  }

  /**
   * 一次性监听
   */
  once<K extends keyof Events>(event: K, handler: Events[K]): () => void {
    const wrapper: Events[K] = ((...args: Parameters<Events[K]>) => {
      this.off(event, wrapper)
      handler(...args)
    }) as Events[K]

    return this.on(event, wrapper)
  }

  /**
   * 取消监听
   */
  off<K extends keyof Events>(event: K, handler?: Events[K]): void {
    if (!handler) {
      // 取消所有该事件的监听
      this.listeners.delete(event)
      return
    }

    const handlers = this.listeners.get(event)
    if (handlers) {
      // 类型断言说明：
      // Events[K] 必须可赋值给 Events[keyof Events]，
      // 但 TypeScript 无法自动推导这一点。
      handlers.delete(handler as Events[keyof Events])
      if (handlers.size === 0) {
        this.listeners.delete(event)
      }
    }
  }

  /**
   * 发射事件
   */
  emit<K extends keyof Events>(
    event: K,
    ...args: Parameters<Events[K]>
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
  listenerCount<K extends keyof Events>(event: K): number {
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
  eventNames(): Array<keyof Events> {
    return Array.from(this.listeners.keys())
  }
}
