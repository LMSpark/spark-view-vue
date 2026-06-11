/**
 * @module @spark-appworks/spark-data:core/event-emitter
 * @spark-appworks/spark-data 的 core/event-emitter 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
import type { SparkEventEmitter } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createEventEmitter<TEventMap extends Record<string, any[]> = Record<string, any[]>>(): SparkEventEmitter<TEventMap> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listeners = new Map<string, Set<(...args: any[]) => void>>()

  return {
    on(event, handler) {
      let handlers = listeners.get(event)
      if (!handlers) {
        handlers = new Set()
        listeners.set(event, handlers)
      }
      handlers.add(handler)
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler)
    },
    emit(event, ...args) {
      const handlers = listeners.get(event)
      if (!handlers) return
      for (const handler of handlers) {
        handler(...args)
      }
    },
    removeAllListeners(event) {
      if (event !== undefined) {
        listeners.delete(event)
        return
      }
      listeners.clear()
    },
    listenerCount(event) {
      if (event !== undefined) return listeners.get(event)?.size ?? 0
      let total = 0
      for (const handlers of listeners.values()) {
        total += handlers.size
      }
      return total
    },
  }
}
