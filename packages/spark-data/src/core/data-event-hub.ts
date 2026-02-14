/**
 * 数据事件中枢 — 统一的事件发布/订阅系统
 *
 * 替代原有的 EventManager + SubscriptionManager 双轨模式，
 * 遵循 spark-utils EventProvider 接口模式。
 *
 * 设计原则（SOLID）：
 * - 单一职责：只管事件注册、分发、查询
 * - 开放封闭：通过事件名扩展，不修改内部逻辑
 *
 * 事件命名规范：
 * - 视图状态变化：  `view:stateChanged`
 * - 视图订阅通知：  `view:{tableName}.{contextId}:changed`
 * - 加载生命周期：  `load:start` / `load:success` / `load:error`
 * - CRUD 操作：     `dataLoaded` / `recordCreated` / `recordUpdated` / ...
 * - 表变化通知：    `tableChanged`
 */

import { Logger } from '@spark-view/spark-utils'

type EventHandler = (...args: unknown[]) => void

export class DataEventHub {
  private listeners = new Map<string, Set<EventHandler>>()
  private logger = Logger('DataEventHub')

  // ===== 事件注册 =====

  /**
   * 注册事件处理器
   * @param event 事件名
   * @param handler 处理函数
   * @returns 取消注册函数
   */
  on(event: string, handler: EventHandler): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(handler)
    return () => this.off(event, handler)
  }

  /**
   * 移除事件处理器
   * @param event 事件名
   * @param handler 处理函数（不传则移除该事件全部监听）
   */
  off(event: string, handler?: EventHandler): void {
    if (!handler) {
      this.listeners.delete(event)
      return
    }
    const set = this.listeners.get(event)
    if (!set) return
    set.delete(handler)
    if (set.size === 0) this.listeners.delete(event)
  }

  // ===== 事件分发 =====

  /**
   * 发送事件（同步，错误隔离）
   * @param event 事件名
   * @param data 事件数据
   */
  emit(event: string, data?: unknown): void {
    const set = this.listeners.get(event)
    if (!set?.size) return
    for (const handler of [...set]) {
      try { handler(data) } catch (e) { this.logger.error(`事件错误 '${event}':`, e) }
    }
  }

  // ===== 查询 =====

  /**
   * 检查事件是否有监听器
   * @param event 事件名
   */
  has(event: string): boolean {
    return (this.listeners.get(event)?.size ?? 0) > 0
  }

  /**
   * 检查匹配前缀的事件是否有任何监听器
   * @param prefix 事件名前缀
   */
  hasPrefix(prefix: string): boolean {
    for (const [key, set] of this.listeners) {
      if (key.startsWith(prefix) && set.size > 0) return true
    }
    return false
  }
}
