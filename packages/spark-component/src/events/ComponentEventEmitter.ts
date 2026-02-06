/**
 * 组件事件发射器
 * 用于组件间的事件通信（通过能力系统提供）
 */

import { Logger } from '@spark-view/spark-utils'

const logger = Logger('Spark:ComponentEvent')

/**
 * 组件事件提供者接口
 * 通过能力系统提供给子组件使用
 */
export interface ComponentEventProvider {
  /**
   * 添加事件监听
   */
  addEventListener: (event: string, handler: Function) => void

  /**
   * 移除事件监听
   */
  removeEventListener: (event: string, handler: Function) => void

  /**
   * 发射事件
   */
  emit: (event: string, ...args: unknown[]) => void
}

/**
 * 创建组件事件发射器
 * 用于父组件提供事件能力
 */
export function createComponentEventEmitter(componentType?: string): ComponentEventProvider {
  const listeners = new Map<string, Set<Function>>()
  const prefix = componentType ? `[${componentType}]` : ''

  return {
    addEventListener(event: string, handler: Function) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set())
      }
      const handlers = listeners.get(event)
      if (handlers) {
        handlers.add(handler)
      }
      logger.debug(`${prefix} Event listener added:`, event)
    },

    removeEventListener(event: string, handler: Function) {
      const handlers = listeners.get(event)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) {
          listeners.delete(event)
        }
        logger.debug(`${prefix} Event listener removed:`, event)
      }
    },

    emit(event: string, ...args: unknown[]) {
      const handlers = listeners.get(event)
      if (handlers && handlers.size > 0) {
        logger.debug(`${prefix} Emitting event:`, event, `(${handlers.size} listeners)`)
        handlers.forEach((handler) => {
          try {
            handler(...args)
          } catch (error) {
            logger.error(`${prefix} Error in event handler for "${event}":`, error)
          }
        })
      } else {
        logger.debug(`${prefix} No listeners for event:`, event)
      }
    }
  }
}


