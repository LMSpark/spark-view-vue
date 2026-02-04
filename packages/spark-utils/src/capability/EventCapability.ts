/**
 * 事件能力集成
 * 将事件系统整合到能力系统中
 */

import { Logger } from '../logger.js'
import type {
  CapabilityProvider,
  CapabilityConsumer,
  CapabilityConnector
} from './types.js'

const logger = Logger('EventCapability')

/**
 * 事件能力提供者接口
 * 组件通过能力系统提供事件
 */
export interface EventCapabilityProvider {
  on: (event: string, handler: (...args: unknown[]) => void) => void
  off: (event: string, handler: (...args: unknown[]) => void) => void
  emit: (event: string, ...args: unknown[]) => void
  once?: (event: string, handler: (...args: unknown[]) => void) => void
}

/**
 * 事件能力消费者接口
 * 子组件通过能力系统消费父组件事件
 */
export interface EventCapabilityConsumer {
  handlers: Map<string, (...args: unknown[]) => void>
}

/**
 * 事件能力连接器
 * 自动连接提供者的事件系统和消费者的处理器
 */
export class EventCapabilityConnector implements CapabilityConnector {
  private connections = new Map<string, Map<string, Function>>()

  connect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean {
    try {
      const eventProvider = provider.implementation
      const eventConsumer = consumer.implementation

      if (!this.isEventProvider(eventProvider)) {
        logger.warn('Provider does not implement EventCapabilityProvider interface')
        return false
      }

      if (!this.isEventConsumer(eventConsumer)) {
        logger.warn('Consumer does not implement EventCapabilityConsumer interface')
        return false
      }

      const connectionKey = this.getConnectionKey(provider, consumer)
      const handlerMap = new Map<string, Function>()

      // 连接所有处理器
      for (const [eventName, handler] of eventConsumer.handlers.entries()) {
        eventProvider.on(eventName, handler)
        handlerMap.set(eventName, handler)
        logger.debug(`Connected event handler: ${eventName}`)
      }

      this.connections.set(connectionKey, handlerMap)
      logger.info(`✅ Event capability connected: ${provider.name}`)
      return true
    } catch (e: unknown) {
      logger.error('Failed to connect event capability:', String(e))
      return false
    }
  }

  disconnect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean {
    try {
      const eventProvider = provider.implementation
      if (!this.isEventProvider(eventProvider)) {
        return false
      }
      
      const connectionKey = this.getConnectionKey(provider, consumer)
      const handlerMap = this.connections.get(connectionKey)

      if (!handlerMap) {
        return false
      }

      // 断开所有处理器
      for (const [eventName, handler] of handlerMap.entries()) {
        eventProvider.off(eventName, handler as (...args: unknown[]) => void)
        logger.debug(`Disconnected event handler: ${eventName}`)
      }

      this.connections.delete(connectionKey)
      logger.info(`❌ Event capability disconnected: ${provider.name}`)
      return true
    } catch (e: unknown) {
      logger.error('Failed to disconnect event capability:', String(e))
      return false
    }
  }

  isConnected(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean {
    const connectionKey = this.getConnectionKey(provider, consumer)
    return this.connections.has(connectionKey)
  }

  private getConnectionKey(provider: CapabilityProvider, consumer: CapabilityConsumer): string {
    return `${provider.name}:${consumer.capabilityName}`
  }

  private isEventProvider(impl: unknown): impl is EventCapabilityProvider {
    return impl !== null && typeof impl === 'object' && 
      'on' in impl && 'off' in impl && 'emit' in impl
  }

  private isEventConsumer(impl: unknown): impl is EventCapabilityConsumer {
    return impl !== null && typeof impl === 'object' && 'handlers' in impl
  }
}

/**
 * 创建事件能力提供者
 * 便捷工厂函数
 */
export function createEventCapabilityProvider(name: string): {
  provider: CapabilityProvider
  emitter: EventCapabilityProvider
} {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  const emitter: EventCapabilityProvider = {
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set())
      }
      const handlers = listeners.get(event)
      if (handlers) {
        handlers.add(handler)
      }
    },

    off(event: string, handler: (...args: unknown[]) => void) {
      const handlers = listeners.get(event)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) {
          listeners.delete(event)
        }
      }
    },

    emit(event: string, ...args: unknown[]) {
      const handlers = listeners.get(event)
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(...args)
          } catch (e) {
            logger.error(`Error in event handler for '${event}':`, e)
          }
        })
      }
    },

    once(event: string, handler: (...args: unknown[]) => void) {
      const onceHandler = (...args: unknown[]) => {
        handler(...args)
        this.off(event, onceHandler)
      }
      this.on(event, onceHandler)
    }
  }

  const provider: CapabilityProvider<
    Record<string, string>,
    EventCapabilityProvider
  > = {
    name,
    version: '1.0.0',
    interface: {
      on: 'function',
      off: 'function',
      emit: 'function',
      once: 'function'
    },
    implementation: emitter
  }

  return { provider, emitter }
}

/**
 * 创建事件能力消费者
 * 便捷工厂函数
 */
export function createEventCapabilityConsumer(
  capabilityName: string,
  handlers: Record<string, (...args: unknown[]) => void>
): CapabilityConsumer {
  const handlerMap = new Map(Object.entries(handlers))

  return {
    capabilityName,
    interface: {
      handlers: 'Map<string, Function>'
    },
    implementation: {
      handlers: handlerMap
    }
  }
}
