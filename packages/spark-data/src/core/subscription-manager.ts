/**
 * 订阅管理器 - 管理视图（Context）的订阅通知
 * 
 * 核心概念：
 * - 订阅的是**视图**（DataView/Context），不是表（DataTable）
 * - 每个视图由 `tableName.contextId` 唯一标识
 * - 当视图数据变化时，通知所有订阅者
 * 
 * 职责：
 * - 🔗 管理视图订阅（subscribe/unsubscribe）
 * - 📢 通知订阅者（视图数据变化）
 * - 🎯 支持精确通知（指定视图）和广播通知（表的所有视图）
 * - 📊 提供订阅统计信息
 * 
 * 使用场景：
 * - UI组件订阅视图数据
 * - 数据变化时自动更新UI
 * - 响应式数据流
 */

import type { DataSet } from '../dataset'
import type { IDataView } from '../types'
import { Logger } from '@spark-view/spark-utils'

/**
 * 订阅回调函数类型
 * 参数是视图（Context）而非表
 */
export type SubscriptionCallback = (context: IDataView) => void

/**
 * 订阅管理器类
 */
export class SubscriptionManager {
  private logger = Logger()
  
  /**
   * 订阅者存储
   * Key: "tableName.contextId" - 视图的唯一标识
   * Value: Set<callback> - 该视图的所有订阅者
   */
  private subscribers: Map<string, Set<SubscriptionCallback>> = new Map()
  
  constructor(private dataSet: DataSet) {}

  /**
   * 订阅视图数据变化
   * 
   * @param tableName 表名
   * @param contextId 视图ID（上下文ID），默认 'default'
   * @param callback 回调函数，参数是视图对象
   * @returns 取消订阅的函数
   * 
   * 使用示例：
   * ```typescript
   * const unsubscribe = manager.subscribe('Users', 'grid-view', (context) => {
   *   console.log('视图数据变化:', context.rows)
   * })
   * 
   * // 取消订阅
   * unsubscribe()
   * ```
   */
  subscribe(
    tableName: string, 
    contextId: string = 'default', 
    callback: SubscriptionCallback
  ): () => void {
    const viewKey = this.getViewKey(tableName, contextId);
    
    const viewSubscribers = this.subscribers.get(viewKey)
    if (viewSubscribers) {
      viewSubscribers.add(callback)
    } else {
      this.subscribers.set(viewKey, new Set([callback]))
    }
    
    this.logger.info(`📡 UI 订阅视图: ${viewKey} (共 ${this.subscribers.get(viewKey)?.size} 个订阅者)`);
    
    // 返回取消订阅函数
    return () => {
      this.unsubscribe(tableName, contextId, callback);
    };
  }

  /**
   * 取消订阅
   * 
   * @param tableName 表名
   * @param contextId 视图ID
   * @param callback 要移除的回调函数
   */
  unsubscribe(
    tableName: string, 
    contextId: string = 'default', 
    callback: SubscriptionCallback
  ): void {
    const viewKey = this.getViewKey(tableName, contextId);
    const viewSubscribers = this.subscribers.get(viewKey);
    
    if (viewSubscribers) {
      viewSubscribers.delete(callback);
      
      // 如果该视图没有订阅者了，删除整个Set
      if (viewSubscribers.size === 0) {
        this.subscribers.delete(viewKey);
        this.logger.info(`🗑️ 视图 ${viewKey} 的所有订阅已清除`);
      } else {
        this.logger.info(`📡 取消订阅视图: ${viewKey} (剩余 ${viewSubscribers.size} 个订阅者)`);
      }
    }
  }

  /**
   * 通知订阅者：视图数据已变化
   * 
   * @param tableName 表名
   * @param contextId 视图ID，如果未指定则通知表的所有视图
   * 
   * 两种通知模式：
   * 1. 精确通知：指定contextId，只通知该视图的订阅者
   * 2. 广播通知：不指定contextId，通知表的所有视图的订阅者
   * 
   * 使用场景：
   * - 精确通知：视图的过滤/排序/选中状态变化
   * - 广播通知：表的数据变化（影响所有视图）
   */
  notifySubscribers(tableName: string, contextId?: string): void {
    const table = this.dataSet.getTable(tableName);
    if (!table) return;

    // 精确通知：只通知指定视图
    if (contextId !== undefined) {
      this.notifySingleView(tableName, contextId);
    } else {
      // 广播通知前先刷新所有视图的过滤数据
      table.refreshAllContexts();
      this.notifyAllViews(tableName);
    }
  }

  /**
   * 通知单个视图的订阅者
   */
  private notifySingleView(tableName: string, contextId: string): void {
    const viewKey = this.getViewKey(tableName, contextId);
    const viewSubscribers = this.subscribers.get(viewKey);
    
    if (viewSubscribers && viewSubscribers.size > 0) {
      const context = this.dataSet.getContext(tableName, contextId);
      
      if (context) {
        this.logger.info(`📢 通知 ${viewSubscribers.size} 个订阅者: ${viewKey} 视图数据已更新`);
        viewSubscribers.forEach(callback => callback(context));
      }
    }
  }

  /**
   * 通知表的所有视图的订阅者
   */
  private notifyAllViews(tableName: string): void {
    // 找到所有以 tableName 开头的视图Key
    const viewKeys = Array.from(this.subscribers.keys())
      .filter(key => key.startsWith(`${tableName}.`));
    
    if (viewKeys.length > 0) {
      this.logger.info(`📢 广播通知: 表 ${tableName} 的 ${viewKeys.length} 个视图`);
    }
    
    viewKeys.forEach(viewKey => {
      const contextId = this.getContextIdFromKey(viewKey);
      const context = this.dataSet.getContext(tableName, contextId);
      const viewSubscribers = this.subscribers.get(viewKey);
      
      if (viewSubscribers && context) {
        this.logger.info(`   └─ ${viewKey}: 通知 ${viewSubscribers.size} 个订阅者`);
        viewSubscribers.forEach(callback => callback(context));
      }
    });
  }

  /**
   * 检查视图是否有订阅者
   * 
   * @param tableName 表名
   * @param contextId 视图ID
   * @returns 是否有订阅者
   */
  hasSubscribers(tableName: string, contextId?: string): boolean {
    if (contextId !== undefined) {
      // 检查单个视图
      const viewKey = this.getViewKey(tableName, contextId);
      const viewSubscribers = this.subscribers.get(viewKey);
      return viewSubscribers !== undefined && viewSubscribers.size > 0;
    } else {
      // 检查表的所有视图
      return Array.from(this.subscribers.keys())
        .some(key => key.startsWith(`${tableName}.`));
    }
  }

  /**
   * 获取视图的订阅者数量
   * 
   * @param tableName 表名
   * @param contextId 视图ID，未指定则返回表的所有视图的订阅者总数
   * @returns 订阅者数量
   */
  getSubscriberCount(tableName: string, contextId?: string): number {
    if (contextId !== undefined) {
      // 单个视图的订阅者数量
      const viewKey = this.getViewKey(tableName, contextId);
      return this.subscribers.get(viewKey)?.size ?? 0;
    } else {
      // 表的所有视图的订阅者总数
      return Array.from(this.subscribers.keys())
        .filter(key => key.startsWith(`${tableName}.`))
        .reduce((count, key) => count + (this.subscribers.get(key)?.size ?? 0), 0);
    }
  }

  /**
   * 清空表的所有视图的订阅者
   * 
   * @param tableName 表名
   */
  clearTableSubscribers(tableName: string): void {
    const viewKeys = Array.from(this.subscribers.keys())
      .filter(key => key.startsWith(`${tableName}.`));
    
    viewKeys.forEach(key => {
      this.subscribers.delete(key);
    });
    
    if (viewKeys.length > 0) {
      this.logger.info(`🗑️ 清空表 ${tableName} 的 ${viewKeys.length} 个视图的所有订阅`);
    }
  }

  /**
   * 清空所有订阅
   */
  clearAllSubscribers(): void {
    const totalViews = this.subscribers.size;
    this.subscribers.clear();
    
    if (totalViews > 0) {
      this.logger.info(`🗑️ 清空所有订阅 (${totalViews} 个视图)`);
    }
  }

  /**
   * 获取订阅统计信息
   * 用于调试和监控
   */
  getSubscriptionStats(): {
    totalViews: number;
    totalSubscribers: number;
    viewDetails: Array<{
      viewKey: string;
      tableName: string;
      contextId: string;
      subscriberCount: number;
    }>;
  } {
    const viewDetails = Array.from(this.subscribers.entries()).map(([viewKey, subs]) => {
      const parts = viewKey.split('.');
      const tableName = parts[0] ?? '';
      const contextId = parts[1] ?? 'default';
      return {
        viewKey,
        tableName,
        contextId,
        subscriberCount: subs.size
      };
    });

    const totalSubscribers = viewDetails.reduce(
      (sum, detail) => sum + detail.subscriberCount, 
      0
    );

    return {
      totalViews: this.subscribers.size,
      totalSubscribers,
      viewDetails
    };
  }

  /**
   * 获取视图的唯一标识Key
   * 格式: "tableName.contextId"
   */
  private getViewKey(tableName: string, contextId: string): string {
    return `${tableName}.${contextId}`;
  }

  /**
   * 从viewKey中提取contextId
   */
  private getContextIdFromKey(viewKey: string): string {
    return viewKey.split('.')[1] ?? 'default';
  }

  /**
   * 获取所有被订阅的视图Key列表
   * @returns 视图Key数组
   */
  getSubscribedViewKeys(): string[] {
    return Array.from(this.subscribers.keys());
  }

  /**
   * 获取表的所有被订阅的视图
   * @param tableName 表名
   * @returns 该表的所有视图Key
   */
  getTableViewKeys(tableName: string): string[] {
    return Array.from(this.subscribers.keys())
      .filter(key => key.startsWith(`${tableName}.`));
  }
}
