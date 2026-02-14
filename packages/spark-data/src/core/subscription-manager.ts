/**
 * 极简订阅管理器 — 管理视图（DataView）的数据变化订阅
 *
 * 订阅粒度：tableName.dataViewId
 */

// ===== 类型定义 =====

import type { DataSet } from '../dataset'
import type { DataView } from '../data-view'

/**
 * 订阅回调函数类型
 * @param dataView 发生变化的数据视图
 */
export type SubscriptionCallback = (dataView: DataView) => void

// ===== 类定义 =====

export class SubscriptionManager {
  // ===== 属性 =====

  /** 订阅存储：key 为 "tableName.dataViewId"，value 为回调函数集合 */
  private subs = new Map<string, Set<SubscriptionCallback>>()

  // ===== 构造函数 =====

  /**
   * 创建订阅管理器实例
   * @param dataSet 关联的数据集实例
   */
  constructor(private dataSet: DataSet) {}

  // ===== 私有工具方法 =====

  /**
   * 生成订阅键
   * @param tableName 表名
   * @param dataViewId 数据视图ID
   * @returns 订阅键字符串
   */
  private key(tableName: string, dataViewId: string): string {
    return `${tableName}.${dataViewId}`
  }

  // ===== 订阅管理 =====

  /**
   * 订阅数据视图的变化通知
   * @param tableName 表名
   * @param dataViewId 数据视图ID，默认为 'default'
   * @param callback 变化回调函数
   * @returns 取消订阅函数
   */
  subscribe(tableName: string, dataViewId: string = 'default', callback: SubscriptionCallback): () => void {
    const key = this.key(tableName, dataViewId)
    let subscriptionSet = this.subs.get(key)
    if (!subscriptionSet) {
      subscriptionSet = new Set()
      this.subs.set(key, subscriptionSet)
    }
    subscriptionSet.add(callback)
    const set = subscriptionSet
    return () => {
      set.delete(callback)
      if (set.size === 0) this.subs.delete(key)
    }
  }

  // ===== 通知机制 =====

  /**
   * 通知订阅者数据变化
   * @param tableName 表名
   * @param dataViewId 指定则精确通知，不指定则广播该表所有数据视图
   */
  notifySubscribers(tableName: string, dataViewId?: string): void {
    const table = this.dataSet.getTable(tableName)
    if (!table) return

    if (dataViewId !== undefined) {
      this.notifyDataView(tableName, dataViewId)
    } else {
      table.refreshAllContexts()
      for (const key of Array.from(this.subs.keys())) {
        if (key.startsWith(`${tableName}.`)) {
          const viewId = key.split('.')[1] ?? 'default'
          this.notifyDataView(tableName, viewId)
        }
      }
    }
  }

  /**
   * 检查是否存在订阅者
   * @param tableName 表名
   * @param dataViewId 数据视图ID，不指定则检查该表是否有任何订阅
   * @returns 是否有订阅者
   */
  hasSubscribers(tableName: string, dataViewId?: string): boolean {
    if (dataViewId !== undefined) {
      return (this.subs.get(this.key(tableName, dataViewId))?.size ?? 0) > 0
    }
    for (const key of Array.from(this.subs.keys())) {
      if (key.startsWith(`${tableName}.`)) return true
    }
    return false
  }

  // ===== 私有通知方法 =====

  /**
   * 通知特定数据视图的订阅者
   * @param tableName 表名
   * @param dataViewId 数据视图ID
   */
  private notifyDataView(tableName: string, dataViewId: string): void {
    const subscriptionSet = this.subs.get(this.key(tableName, dataViewId))
    if (!subscriptionSet?.size) return
    const dataView = this.dataSet.getContext(tableName, dataViewId)
    if (dataView) subscriptionSet.forEach(callback => callback(dataView))
  }
}
