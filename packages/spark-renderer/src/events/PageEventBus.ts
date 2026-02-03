/**
 * 页面层事件总线
 * 每个页面有独立的事件总线实例，实现页面级隔离（双向事件）
 */

import type { DataRow } from '@spark-view/spark-data'
import { EventEmitter } from './EventEmitter'

/**
 * 页面级事件接口（双向事件）
 */
export interface PageEvents extends Record<string, (...args: any[]) => void> {
  // === 向下广播（Broadcast Down）- 页面状态变化通知组件 ===
  // === 向下广播（Broadcast Down）- 页面状态变化通知组件 ===
  
  /**
   * 页面挂载完成 → 通知组件初始化
   */
  'page:mounted': () => void

  /**
   * 页面销毁前 → 通知组件清理资源
   */
  'page:beforeUnmount': () => void

  /**
   * 页面销毁完成
   */
  'page:destroyed': () => void

  /**
   * 数据加载完成 → 通知组件刷新
   */
  'data:loaded': (tableName: string, rows: DataRow[]) => void

  /**
   * 数据刷新 → 强制组件重新渲染
   */
  'data:refresh': (tableName: string) => void

  /**
   * 表单重置 → 组件清空状态
   */
  'form:reset': () => void

  // === 向上冒泡（Bubble Up）- 接收来自组件层的事件 ===

  // === 向上冒泡（Bubble Up）- 接收来自组件层的事件 ===
  
  /**
   * 数据变化 → 页面同步状态
   */
  'data:changed': (tableName: string, row: DataRow) => void

  /**
   * 数据保存成功 → 页面显示提示
   */
  'data:saved': (tableName: string, row?: DataRow) => void

  /**
   * 数据删除 → 页面更新列表
   */
  'data:deleted': (tableName: string, rowId: string | number) => void

  /**
   * 表单提交 → 页面处理保存
   */
  'form:submit': (formData: Record<string, unknown>) => void

  /**
   * 表单值变化 → 页面同步状态
   */
  'form:change': (field: string, value: unknown) => void

  /**
   * 表单验证失败 → 页面显示错误
   */
  'form:validate-error': (errors: Record<string, string[]>) => void

  /**
   * 脚本执行错误 → 页面错误处理
   */
  'script:error': (error: Error) => void

  /**
   * API 调用成功 → 页面记录日志
   */
  'api:success': (apiName: string, result: unknown) => void

  /**
   * API 调用失败 → 页面错误处理
   */
  'api:error': (apiName: string, error: Error) => void

  /**
   * Grid 行点击 → 页面更新选择状态
   */
  'grid:rowClick': (row: DataRow) => void

  /**
   * Grid 选择变化 → 页面更新按钮状态
   */
  'grid:selection': (rows: DataRow[]) => void

  /**
   * Grid 排序 → 页面保存偏好
   */
  'grid:sorted': (field: string, order: string) => void
}

/**
 * 页面事件总线类
 * 每个页面实例化一个独立的总线
 */
export class PageEventBus extends EventEmitter<PageEvents> {
  constructor(public readonly pageId: string) {
    super()
  }

  /**
   * 销毁页面事件总线
   */
  destroy(): void {
    this.removeAllListeners()
  }

  /**
   * 获取事件统计信息（调试用）
   */
  getStats(): Record<string, number> {
    const stats: Record<string, number> = {}
    this.eventNames().forEach((event) => {
      stats[String(event)] = this.listenerCount(event)
    })
    return stats
  }
}

/**
 * 创建页面事件总线
 */
export function createPageEventBus(pageId: string): PageEventBus {
  return new PageEventBus(pageId)
}

/**
 * 页面事件总线管理器
 * 管理所有页面的事件总线实例
 */
class PageEventBusManager {
  private buses = new Map<string, PageEventBus>()

  /**
   * 获取或创建页面事件总线
   */
  getOrCreate(pageId: string): PageEventBus {
    if (!this.buses.has(pageId)) {
      this.buses.set(pageId, new PageEventBus(pageId))
    }
    return this.buses.get(pageId)!
  }

  /**
   * 销毁页面事件总线
   */
  destroy(pageId: string): void {
    const bus = this.buses.get(pageId)
    if (bus) {
      bus.destroy()
      this.buses.delete(pageId)
    }
  }

  /**
   * 获取所有页面 ID
   */
  getPageIds(): string[] {
    return Array.from(this.buses.keys())
  }

  /**
   * 清空所有页面事件总线
   */
  clear(): void {
    this.buses.forEach((bus) => bus.destroy())
    this.buses.clear()
  }

  /**
   * 获取统计信息（调试用）
   */
  getStats(): Record<string, Record<string, number>> {
    const stats: Record<string, Record<string, number>> = {}
    this.buses.forEach((bus, pageId) => {
      stats[pageId] = bus.getStats()
    })
    return stats
  }
}

/**
 * 全局页面事件总线管理器实例
 */
export const pageEventBusManager = new PageEventBusManager()
