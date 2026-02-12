/**
 * 事件管理器 - 管理DataSet的事件系统
 * 
 * 职责：
 * - 📡 事件注册与监听（on/once）
 * - 🔕 事件监听器移除（off）
 * - 📢 事件触发与分发（emit）
 * - 📊 事件统计与调试
 * 
 * 核心事件类型：
 * - loadStart: 数据加载开始
 * - loadSuccess: 数据加载成功
 * - loadError: 数据加载失败
 * - dependencyUpdated: 视图依赖已更新
 * - selectionChanged: 选中状态变化
 * - selectionCleaned: 选中状态已清理
 * - dataChanged: 数据变化（CRUD操作）
 * 
 * 使用示例：
 * ```typescript
 * const manager = new EventManager()
 * 
 * // 注册监听器
 * manager.on('loadSuccess', (data) => {
 *   console.log('加载成功:', data)
 * })
 * 
 * // 一次性监听器
 * manager.once('loadStart', (data) => {
 *   console.log('首次加载开始')
 * })
 * 
 * // 触发事件
 * manager.emit('loadSuccess', { tableName: 'Users' })
 * 
 * // 移除监听器
 * manager.off('loadSuccess', callback)
 * ```
 */

import { Logger } from '@spark-view/spark-utils'

/**
 * 事件回调函数类型
 */
export type EventCallback = (...args: unknown[]) => void

/**
 * 事件监听器包装类型
 * 支持一次性监听器标记
 */
interface EventListener {
  callback: EventCallback
  once: boolean
}

/**
 * 事件管理器类
 */
export class EventManager {
  private logger = Logger()
  
  /**
   * 事件监听器存储
   * Key: 事件名称
   * Value: 监听器列表
   */
  private listeners: Map<string, EventListener[]> = new Map()

  /**
   * 注册事件监听器
   * 
   * @param event 事件名称
   * @param callback 回调函数
   * @returns 取消监听函数
   * 
   * 使用示例：
   * ```typescript
   * const unsubscribe = manager.on('loadSuccess', (data) => {
   *   console.log('加载成功:', data)
   * })
   * 
   * // 取消监听
   * unsubscribe()
   * ```
   */
  on(event: string, callback: EventCallback): () => void {
    const eventListeners = this.listeners.get(event)
    const listener: EventListener = { callback, once: false }
    
    if (eventListeners) {
      eventListeners.push(listener)
    } else {
      this.listeners.set(event, [listener])
    }
    
    this.logger.debug(`📡 注册事件监听器: ${event} (共 ${this.getListenerCount(event)} 个)`);
    
    // 返回取消监听函数
    return () => {
      this.off(event, callback);
    };
  }

  /**
   * 注册一次性事件监听器
   * 监听器在首次触发后自动移除
   * 
   * @param event 事件名称
   * @param callback 回调函数
   * @returns 取消监听函数
   * 
   * 使用场景：
   * - 等待首次数据加载完成
   * - 初始化操作
   * - 一次性通知
   */
  once(event: string, callback: EventCallback): () => void {
    const eventListeners = this.listeners.get(event)
    const listener: EventListener = { callback, once: true }
    
    if (eventListeners) {
      eventListeners.push(listener)
    } else {
      this.listeners.set(event, [listener])
    }
    
    this.logger.debug(`📡 注册一次性监听器: ${event}`);
    
    // 返回取消监听函数
    return () => {
      this.off(event, callback);
    };
  }

  /**
   * 移除事件监听器
   * 
   * @param event 事件名称
   * @param callback 要移除的回调函数
   * 
   * 如果不提供callback，则移除该事件的所有监听器
   */
  off(event: string, callback?: EventCallback): void {
    const eventListeners = this.listeners.get(event)
    
    if (!eventListeners) return;
    
    // 如果没有指定callback，移除所有监听器
    if (!callback) {
      this.listeners.delete(event);
      this.logger.debug(`🔕 移除事件 ${event} 的所有监听器`);
      return;
    }
    
    // 移除指定的callback
    const index = eventListeners.findIndex(listener => listener.callback === callback)
    if (index > -1) {
      eventListeners.splice(index, 1)
      this.logger.debug(`🔕 移除事件监听器: ${event} (剩余 ${eventListeners.length} 个)`);
      
      // 如果该事件没有监听器了，删除整个数组
      if (eventListeners.length === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * 触发事件
   * 
   * @param event 事件名称
   * @param data 事件数据
   * 
   * 执行流程：
   * 1. 获取所有监听器
   * 2. 按注册顺序执行
   * 3. 移除一次性监听器
   * 4. 捕获异常，避免中断其他监听器
   */
  emit(event: string, data: unknown): void {
    const eventListeners = this.listeners.get(event)
    
    if (!eventListeners || eventListeners.length === 0) return;
    
    this.logger.debug(`📢 触发事件: ${event} (${eventListeners.length} 个监听器)`);
    
    // 复制监听器列表，避免在执行过程中修改导致问题
    const listenersToCall = [...eventListeners];
    
    // 收集需要移除的一次性监听器
    const onceListenersToRemove: EventCallback[] = [];
    
    // 执行所有监听器
    listenersToCall.forEach(listener => {
      try {
        listener.callback(data);
        
        // 标记一次性监听器待移除
        if (listener.once) {
          onceListenersToRemove.push(listener.callback);
        }
      } catch (error) {
        this.logger.error(`❌ 事件监听器执行失败: ${event}`, error);
      }
    });
    
    // 移除一次性监听器
    onceListenersToRemove.forEach(callback => {
      this.off(event, callback);
    });
  }

  /**
   * 移除所有事件监听器
   * 
   * @param event 事件名称，如果不指定则移除所有事件的所有监听器
   */
  removeAllListeners(event?: string): void {
    if (event) {
      // 移除指定事件的所有监听器
      const count = this.getListenerCount(event);
      this.listeners.delete(event);
      this.logger.debug(`🗑️ 移除事件 ${event} 的所有监听器 (${count} 个)`);
    } else {
      // 移除所有事件的所有监听器
      const totalCount = this.getTotalListenerCount();
      this.listeners.clear();
      this.logger.debug(`🗑️ 移除所有事件监听器 (${totalCount} 个)`);
    }
  }

  /**
   * 获取事件的监听器数量
   * 
   * @param event 事件名称
   * @returns 监听器数量
   */
  getListenerCount(event: string): number {
    return this.listeners.get(event)?.length ?? 0;
  }

  /**
   * 获取所有事件的监听器总数
   * 
   * @returns 监听器总数
   */
  getTotalListenerCount(): number {
    return Array.from(this.listeners.values())
      .reduce((sum, listeners) => sum + listeners.length, 0);
  }

  /**
   * 检查事件是否有监听器
   * 
   * @param event 事件名称
   * @returns 是否有监听器
   */
  hasListeners(event: string): boolean {
    const eventListeners = this.listeners.get(event);
    return eventListeners !== undefined && eventListeners.length > 0;
  }

  /**
   * 获取所有已注册的事件名称
   * 
   * @returns 事件名称数组
   */
  getEventNames(): string[] {
    return Array.from(this.listeners.keys());
  }

  /**
   * 获取事件统计信息
   * 用于调试和监控
   */
  getEventStats(): {
    totalEvents: number;
    totalListeners: number;
    eventDetails: Array<{
      event: string;
      listenerCount: number;
      onceCount: number;
    }>;
  } {
    const eventDetails = Array.from(this.listeners.entries()).map(([event, listeners]) => {
      const onceCount = listeners.filter(l => l.once).length;
      return {
        event,
        listenerCount: listeners.length,
        onceCount
      };
    });

    return {
      totalEvents: this.listeners.size,
      totalListeners: this.getTotalListenerCount(),
      eventDetails
    };
  }

  /**
   * 等待事件触发（Promise风格）
   * 
   * @param event 事件名称
   * @param timeout 超时时间（毫秒），0表示不超时
   * @returns Promise，resolve事件数据，reject超时
   * 
   * 使用示例：
   * ```typescript
   * try {
   *   const data = await manager.waitFor('loadSuccess', 5000)
   *   console.log('加载成功:', data)
   * } catch (error) {
   *   console.error('等待超时')
   * }
   * ```
   */
  waitFor(event: string, timeout: number = 0): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | null = null;
      
      // 注册一次性监听器
      const unsubscribe = this.once(event, (data) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(data);
      });
      
      // 设置超时
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          unsubscribe();
          reject(new Error(`等待事件 ${event} 超时 (${timeout}ms)`));
        }, timeout);
      }
    });
  }

  /**
   * 获取事件监听器列表（调试用）
   * 
   * @param event 事件名称
   * @returns 监听器函数数组
   */
  getListeners(event: string): EventCallback[] {
    const eventListeners = this.listeners.get(event);
    return eventListeners ? eventListeners.map(l => l.callback) : [];
  }
}
