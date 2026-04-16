import type { IEventEmitter } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createEventEmitter<TEventMap extends Record<string, any[]> = Record<string, any[]>>(): IEventEmitter<TEventMap> {
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
