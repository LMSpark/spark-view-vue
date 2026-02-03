/**
 * EventEmitter 基类
 * 提供类型安全的事件发布/订阅机制
 */
import type { AnyFunction } from './types/common';
export interface EventMap {
    [event: string]: AnyFunction;
}
export declare class EventEmitter<Events extends EventMap = EventMap> {
    private listeners;
    /**
     * 监听事件
     */
    on<K extends keyof Events>(event: K, handler: Events[K]): () => void;
    /**
     * 一次性监听
     */
    once<K extends keyof Events>(event: K, handler: Events[K]): () => void;
    /**
     * 取消监听
     */
    off<K extends keyof Events>(event: K, handler?: Events[K]): void;
    /**
     * 发射事件
     */
    emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): void;
    /**
     * 获取事件监听器数量
     */
    listenerCount<K extends keyof Events>(event: K): number;
    /**
     * 清空所有监听器
     */
    removeAllListeners(): void;
    /**
     * 获取所有事件名
     */
    eventNames(): Array<keyof Events>;
}
//# sourceMappingURL=eventEmitter.d.ts.map