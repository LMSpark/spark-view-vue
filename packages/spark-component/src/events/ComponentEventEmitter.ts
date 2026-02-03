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
 * 组件事件消费者接口
 * 子组件通过能力系统消费父组件的事件
 */
export interface ComponentEventConsumer {
  /**
   * 事件处理函数
   */
  onEvent: (event: string, ...args: unknown[]) => void
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

/**
 * 创建组件事件消费者
 * 用于子组件消费父组件的事件
 */
export function createComponentEventConsumer(
  handlers: Record<string, Function>
): ComponentEventConsumer {
  return {
    onEvent(event: string, ...args: unknown[]) {
      const handler = handlers[event]
      if (handler && typeof handler === 'function') {
        try {
          handler(...args)
        } catch (error) {
          logger.error(`Error handling component event "${event}":`, error)
        }
      }
    }
  }
}

/**
 * 常用组件事件名称
 */
export const ComponentEvents = {
  // Grid 相关事件
  GRID_ROW_CLICK: 'rowClick',
  GRID_ROW_DOUBLE_CLICK: 'rowDoubleClick',
  GRID_SELECTION_CHANGED: 'selectionChanged',
  GRID_DATA_LOADED: 'dataLoaded',
  GRID_DATA_ERROR: 'dataError',

  // Column 相关事件
  COLUMN_ADDED: 'columnAdded',
  COLUMN_REMOVED: 'columnRemoved',
  COLUMN_UPDATED: 'columnUpdated',

  // Form 相关事件
  FORM_SUBMIT: 'formSubmit',
  FORM_RESET: 'formReset',
  FORM_CHANGE: 'formChange',
  FORM_VALIDATE_ERROR: 'formValidateError',

  // 通用组件事件
  COMPONENT_MOUNTED: 'componentMounted',
  COMPONENT_DESTROYED: 'componentDestroyed',
  VALUE_CHANGED: 'valueChanged',
  FOCUS: 'focus',
  BLUR: 'blur',
  CLICK: 'click'
} as const

/**
 * 组件事件类型
 */
export type ComponentEventType = typeof ComponentEvents[keyof typeof ComponentEvents]
