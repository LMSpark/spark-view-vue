/**
 * 事件能力 - 能力系统的3种类型之一
 * 提供 on/off/emit 模式的事件系统
 */

import { Logger } from '../logger.js'
import type { Provider, Consumer, Connector } from './types.js'

const logger = Logger('EventCapability')

/**
 * 事件提供者接口
 */
export interface EventProvider {
  on: (event: string, handler: (...args: unknown[]) => void) => void
  off: (event: string, handler: (...args: unknown[]) => void) => void
  emit: (event: string, ...args: unknown[]) => void
}

/**
 * 事件消费者接口
 */
export interface EventConsumer {
  handlers: Map<string, (...args: unknown[]) => void>
}

/**
 * 事件专用连接器
 * 负责将 consumer.handlers 中的处理器注册到 provider
 */
export class EventConnector implements Connector<Provider, Consumer> {
  private connections = new Map<string, Map<string, Function>>()

  connect(provider: Provider, consumer: Consumer): boolean {
    try {
      const p = provider.implementation as EventProvider
      const c = consumer.implementation as EventConsumer
      
      if (!p?.on || !c?.handlers) return false

      const key = `${provider.name}:${consumer.capabilityName}`
      const handlerMap = new Map<string, Function>()

      // 将 consumer 的所有 handlers 注册到 provider
      for (const [event, handler] of c.handlers.entries()) {
        p.on(event, handler)
        handlerMap.set(event, handler)
      }

      this.connections.set(key, handlerMap)
      logger.debug(`✅ 事件已连接: ${provider.name}`)
      return true
    } catch (e: unknown) {
      logger.error('连接事件失败:', String(e))
      return false
    }
  }

  disconnect(provider: Provider, consumer: Consumer): boolean {
    try {
      const p = provider.implementation as EventProvider
      const key = `${provider.name}:${consumer.capabilityName}`
      const handlerMap = this.connections.get(key)
      
      if (!p?.off || !handlerMap) return false

      // 注销所有 handlers
      for (const [event, handler] of handlerMap.entries()) {
        p.off(event, handler as (...args: unknown[]) => void)
      }

      this.connections.delete(key)
      logger.debug(`❌ 事件已断开: ${provider.name}`)
      return true
    } catch (e: unknown) {
      logger.error('断开事件失败:', String(e))
      return false
    }
  }

  isConnected(provider: Provider, consumer: Consumer): boolean {
    return this.connections.has(`${provider.name}:${consumer.capabilityName}`)
  }
}

/**
 * 创建事件提供者
 * 返回 Provider 和 EventEmitter，调用者可以用 emitter.emit() 发送事件
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
    provider: { name, version: '1.0.0', implementation: emitter },
    emitter
  }
}

/**
 * 创建事件消费者
 * 将 handlers 对象转换为 Consumer，会在连接时自动注册
 */
export function createConsumer(
  name: string,
  handlers: Record<string, (...args: unknown[]) => void>
): Consumer {
  return {
    capabilityName: name,
    implementation: { handlers: new Map(Object.entries(handlers)) }
  }
}
