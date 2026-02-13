/**
 * 极简事件管理器
 */

type Callback = (...args: unknown[]) => void

export class EventManager {
  private listeners = new Map<string, Callback[]>()

  on(event: string, callback: Callback): () => void {
    const list = this.listeners.get(event)
    if (list) {
      list.push(callback)
    } else {
      this.listeners.set(event, [callback])
    }
    return () => this.off(event, callback)
  }

  off(event: string, callback?: Callback): void {
    if (!callback) {
      this.listeners.delete(event)
      return
    }
    const list = this.listeners.get(event)
    if (!list) return
    const idx = list.indexOf(callback)
    if (idx > -1) list.splice(idx, 1)
    if (list.length === 0) this.listeners.delete(event)
  }

  emit(event: string, data: unknown): void {
    const list = this.listeners.get(event)
    if (!list || list.length === 0) return
    for (const cb of [...list]) {
      try { cb(data) } catch { /* 吞掉，不阻断后续监听器 */ }
    }
  }
}
