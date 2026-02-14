/**
 * 极简订阅管理器 — 管理视图（DataView）的数据变化订阅
 *
 * 订阅粒度：tableName.contextId
 */

import type { DataSet } from '../dataset'
import type { IDataView } from '../types'

export type SubscriptionCallback = (context: IDataView) => void

export class SubscriptionManager {
  private subs = new Map<string, Set<SubscriptionCallback>>()

  constructor(private dataSet: DataSet) {}

  private key(t: string, c: string) { return `${t}.${c}` }

  subscribe(tableName: string, contextId: string = 'default', cb: SubscriptionCallback): () => void {
    const k = this.key(tableName, contextId)
    let s = this.subs.get(k)
    if (!s) { s = new Set(); this.subs.set(k, s) }
    s.add(cb)
    const set = s
    return () => {
      set.delete(cb)
      if (set.size === 0) this.subs.delete(k)
    }
  }

  /**
   * 通知订阅者
   * @param contextId 指定则精确通知，不指定则广播该表所有视图
   */
  notifySubscribers(tableName: string, contextId?: string): void {
    const table = this.dataSet.getTable(tableName)
    if (!table) return

    if (contextId !== undefined) {
      this.notifyView(tableName, contextId)
    } else {
      table.refreshAllContexts()
      for (const k of Array.from(this.subs.keys())) {
        if (k.startsWith(`${tableName}.`)) {
          const cid = k.split('.')[1] ?? 'default'
          this.notifyView(tableName, cid)
        }
      }
    }
  }

  hasSubscribers(tableName: string, contextId?: string): boolean {
    if (contextId !== undefined) {
      return (this.subs.get(this.key(tableName, contextId))?.size ?? 0) > 0
    }
    for (const k of Array.from(this.subs.keys())) {
      if (k.startsWith(`${tableName}.`)) return true
    }
    return false
  }

  private notifyView(tableName: string, contextId: string) {
    const set = this.subs.get(this.key(tableName, contextId))
    if (!set?.size) return
    const ctx = this.dataSet.getContext(tableName, contextId)
    if (ctx) set.forEach(cb => cb(ctx))
  }
}
