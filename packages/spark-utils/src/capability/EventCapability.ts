/**
 * 事件能力系统
 *
 * 提供基于 on/off/emit 模式的事件发布订阅机制
 * 支持类型安全的事件处理和错误隔离
 *
 * @packageDocumentation
 */

// ==================== 导入和依赖 ====================

import { Logger } from '../logger.js'
import type { Provider } from './types.js'

const logger = Logger('EventCapability')

// ==================== 类型定义 ====================

/**
 * 事件提供者接口
 *
 * 实现标准的事件发布订阅模式，支持：
 * - 事件注册和移除
 * - 事件触发和广播
 * - 错误处理和日志记录
 */
export interface EventProvider {
  /** 注册事件处理器 */
  on: (event: string, handler: (...args: unknown[]) => void) => void
  /** 移除事件处理器 */
  off: (event: string, handler: (...args: unknown[]) => void) => void
  /** 发送事件 */
  emit: (event: string, ...args: unknown[]) => void
}

// ==================== 核心功能 ====================

/**
 * 创建事件提供者
 *
 * 创建一个完整的事件发布订阅系统，包含：
 * - 事件监听器管理
 * - 错误隔离处理
 * - 能力系统集成
 *
 * @param name 能力名称，用于在能力系统中注册
 * @returns 包含 Provider 和 EventProvider 实例的对象
 *
 * @example
 * ```typescript
 * const { provider, emitter } = createEventProvider('globalEvents')
 * provide(context, provider.name, provider.implementation)
 *
 * // 订阅事件
 * emitter.on('userLogin', (user) => console.log('User logged in:', user))
 *
 * // 发送事件
 * emitter.emit('userLogin', { id: 1, name: 'Alice' })
 * ```
 */
export function createProvider(name: string): { provider: Provider; emitter: EventProvider } {
  // 事件监听器存储：事件名 -> 处理函数集合
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  // ==================== 事件处理器实现 ====================

  const emitter: EventProvider = {
    /**
     * 注册事件处理器
     *
     * 将事件处理器添加到指定事件的监听列表中
     * 支持同一个事件注册多个处理器
     */
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)?.add(handler)
    },

    /**
     * 移除事件处理器
     *
     * 从指定事件的监听列表中移除处理器
     * 如果事件没有监听器，则清理事件条目
     */
    off(event: string, handler: (...args: unknown[]) => void) {
      const handlers = listeners.get(event)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) listeners.delete(event)
      }
    },

    /**
     * 发送事件
     *
     * 触发指定事件，调用所有注册的处理器
     * 每个处理器在独立的作用域中执行，错误不会传播
     */
    emit(event: string, ...args: unknown[]) {
      listeners.get(event)?.forEach(handler => {
        try {
          handler(...args)
        } catch (e) {
          logger.error(`事件错误 '${event}':`, e)
        }
      })
    }
  }

  // ==================== 能力系统集成 ====================

  return {
    provider: { name, implementation: emitter },
    emitter
  }
}
