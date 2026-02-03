/**
 * EventEmitter 基类
 * 提供类型安全的事件发布/订阅机制
 */
export class EventEmitter {
    constructor() {
        this.listeners = new Map();
    }
    /**
     * 监听事件
     */
    on(event, handler) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(handler);
        // 返回取消监听函数
        return () => this.off(event, handler);
    }
    /**
     * 一次性监听
     */
    once(event, handler) {
        const wrapper = ((...args) => {
            this.off(event, wrapper);
            handler(...args);
        });
        return this.on(event, wrapper);
    }
    /**
     * 取消监听
     */
    off(event, handler) {
        if (!handler) {
            // 取消所有该事件的监听
            this.listeners.delete(event);
            return;
        }
        const handlers = this.listeners.get(event);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.listeners.delete(event);
            }
        }
    }
    /**
     * 发射事件
     */
    emit(event, ...args) {
        const handlers = this.listeners.get(event);
        if (handlers) {
            handlers.forEach((handler) => {
                try {
                    handler(...args);
                }
                catch (error) {
                    console.error(`[EventEmitter] Error in handler for "${String(event)}":`, error);
                }
            });
        }
    }
    /**
     * 获取事件监听器数量
     */
    listenerCount(event) {
        return this.listeners.get(event)?.size ?? 0;
    }
    /**
     * 清空所有监听器
     */
    removeAllListeners() {
        this.listeners.clear();
    }
    /**
     * 获取所有事件名
     */
    eventNames() {
        return Array.from(this.listeners.keys());
    }
}
