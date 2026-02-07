/**
 * 事件能力系统
 *
 * 提供基于 on/off/emit 模式的事件发布订阅机制
 */

import { Logger } from '../logger.js'
import type { Provider } from './types.js'

const logger = Logger('EventCapability')

/**
 * 事件提供者接口
 *
 * 实现标准的事件发布订阅模式
 */
export interface EventProvider {
  /** 注册事件处理器 */
  on: (event: string, handler: (...args: unknown[]) => void) => void
  /** 移除事件处理器 */
  off: (event: string, handler: (...args: unknown[]) => void) => void
  /** 发送事件 */
  emit: (event: string, ...args: unknown[]) => void
}

/**
 * 创建事件提供者
 *
 * @param name 能力名称
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
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  const emitter: EventProvider = {
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)?.add(handler)
    },

    off(event: string, handler: (...args: unknown[]) => void) {
      const handlers = listeners.get(event)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) listeners.delete(event)
      }
    },

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

  return {
    provider: { name, implementation: emitter },
    emitter
  }
}
