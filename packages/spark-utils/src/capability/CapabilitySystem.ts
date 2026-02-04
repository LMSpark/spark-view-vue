/**
 * 能力系统 - 核心实现
 * 通用的能力连接器和管理器
 */

import { Logger } from '../logger.js'
import type {
  CapabilityProvider,
  CapabilityConsumer,
  CapabilityContext,
  CapabilityConnector,
  ICapabilityManager
} from './types.js'

const logger = Logger('Capability')

type AnyFunction = (...args: unknown[]) => unknown

interface DataFlowProvider {
  addListener?: AnyFunction
  removeListener?: AnyFunction
}

interface DataFlowConsumer {
  onData?: AnyFunction
}

interface EventProvider {
  addEventListener?: AnyFunction
  removeEventListener?: AnyFunction
}

interface EventConsumer {
  onEvent?: AnyFunction
}

/**
 * 数据流连接器
 * 用于连接数据流提供者和消费者（addListener/onData 模式）
 */
export class DataFlowConnector implements CapabilityConnector {
  connect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean {
    try {
      const pImpl = provider.implementation
      const cImpl = consumer.implementation
      if (!this.isDataFlowProvider(pImpl) || !this.isDataFlowConsumer(cImpl)) {
        return false
      }
      
      const addListener = pImpl.addListener
      const onData = cImpl.onData
      
      if (typeof addListener === 'function' && typeof onData === 'function') {
        addListener(onData)
        return true
      }
    } catch (e: unknown) {
      logger.error('Failed to connect data flow:', String(e))
    }
    return false
  }

  disconnect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean {
    try {
      const pImpl = provider.implementation
      const cImpl = consumer.implementation
      if (!this.isDataFlowProvider(pImpl) || !this.isDataFlowConsumer(cImpl)) {
        return false
      }
      
      const removeListener = pImpl.removeListener
      const onData = cImpl.onData
      
      if (typeof removeListener === 'function' && typeof onData === 'function') {
        removeListener(onData)
        return true
      }
    } catch (e: unknown) {
      logger.error('Failed to disconnect data flow:', String(e))
    }
    return false
  }

  isConnected(_provider: CapabilityProvider, _consumer: CapabilityConsumer): boolean {
    return false
  }

  private isDataFlowProvider(impl: unknown): impl is DataFlowProvider {
    return impl !== null && typeof impl === 'object' && 
      ('addListener' in impl || 'removeListener' in impl)
  }

  private isDataFlowConsumer(impl: unknown): impl is DataFlowConsumer {
    return impl !== null && typeof impl === 'object' && 'onData' in impl
  }
}

/**
 * 事件连接器
 * 用于连接事件提供者和消费者（addEventListener/onEvent 模式）
 */
export class EventConnector implements CapabilityConnector {
  connect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean {
    try {
      const pImpl = provider.implementation
      const cImpl = consumer.implementation
      if (!this.isEventProvider(pImpl) || !this.isEventConsumer(cImpl)) {
        return false
      }
      
      const addEventListener = pImpl.addEventListener
      const onEvent = cImpl.onEvent
      
      if (typeof addEventListener === 'function' && typeof onEvent === 'function') {
        addEventListener(onEvent)
        return true
      }
    } catch (e: unknown) {
      logger.error('Failed to connect event:', String(e))
    }
    return false
  }

  disconnect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean {
    try {
      const pImpl = provider.implementation
      const cImpl = consumer.implementation
      if (!this.isEventProvider(pImpl) || !this.isEventConsumer(cImpl)) {
        return false
      }
      
      const removeEventListener = pImpl.removeEventListener
      const onEvent = cImpl.onEvent
      
      if (typeof removeEventListener === 'function' && typeof onEvent === 'function') {
        removeEventListener(onEvent)
        return true
      }
    } catch (e: unknown) {
      logger.error('Failed to disconnect event:', String(e))
    }
    return false
  }

  isConnected(_provider: CapabilityProvider, _consumer: CapabilityConsumer): boolean {
    return false
  }

  private isEventProvider(impl: unknown): impl is EventProvider {
    return impl !== null && typeof impl === 'object' && 
      ('addEventListener' in impl || 'removeEventListener' in impl)
  }

  private isEventConsumer(impl: unknown): impl is EventConsumer {
    return impl !== null && typeof impl === 'object' && 'onEvent' in impl
  }
}

/**
 * 方法连接器
 * 用于连接方法提供者和消费者（直接方法绑定）
 */
export class MethodConnector implements CapabilityConnector {
  connect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean {
    try {
      const pImpl = provider.implementation ?? {}
      const cImpl = consumer.implementation ?? {}
      
      if (!this.isRecord(pImpl) || !this.isRecord(cImpl)) {
        return false
      }
      
      Object.keys(consumer.interface ?? {}).forEach(key => {
        const fn = pImpl[key]
        if (typeof fn === 'function') {
          cImpl[key] = fn.bind(pImpl)
        }
      })
      
      return true
    } catch (e: unknown) {
      logger.error('Failed to connect method:', String(e))
      return false
    }
  }

  disconnect(_provider: CapabilityProvider, consumer: CapabilityConsumer): boolean {
    try {
      const cImpl = consumer.implementation
      
      if (cImpl && this.isRecord(cImpl)) {
        Object.keys(consumer.interface ?? {}).forEach(key => {
          if (cImpl[key]) {
            delete cImpl[key]
          }
        })
      }
      
      return true
    } catch (e: unknown) {
      logger.error('Failed to disconnect method:', String(e))
      return false
    }
  }

  isConnected(_provider: CapabilityProvider, consumer: CapabilityConsumer): boolean {
    const cImpl = consumer.implementation
    if (!cImpl || !this.isRecord(cImpl)) return false
    
    return Object.keys(consumer.interface ?? {}).some(key => 
      typeof cImpl[key] === 'function'
    )
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
  }
}

/**
 * 能力管理器
 * 管理能力的注册、连接、断开
 */
export class CapabilityManager implements ICapabilityManager {
  private connectors = new Map<string, CapabilityConnector>()
  private connections = new Map<string, Set<string>>()
  private logger = Logger('CapabilityMgr')

  registerConnector(name: string, connector: CapabilityConnector): void {
    this.connectors.set(name, connector)
    this.logger.debug(`Registered connector: ${name}`)
  }

  unregisterConnector(name: string): boolean {
    return this.connectors.delete(name)
  }

  connectCapability(
    provider: CapabilityProvider,
    consumer: CapabilityConsumer,
    context: CapabilityContext
  ): boolean {
    let connector = this.connectors.get(provider.name)
    
    if (!connector) {
      // 自动检测并注册默认连接器
      connector = new DataFlowConnector()
      this.connectors.set(provider.name, connector)
      this.logger.info(`⚙️ Auto-registered connector for capability '${provider.name}'`)
    }
    
    try {
      const ok = connector.connect(provider, consumer)
      
      if (ok) {
        const key = `${context.id}:${provider.name}`
        const key2 = `${context.id}:${consumer.capabilityName}`
        
        if (!this.connections.has(key)) {
          this.connections.set(key, new Set())
        }
        this.connections.get(key)?.add(key2)
        
        this.logger.info(`🔗 Connected capability '${provider.name}' in context '${context.id}'`)
      }
      
      return ok
    } catch (e) {
      this.logger.error(`Failed to connect capability '${provider.name}':`, e)
      return false
    }
  }

  disconnectCapability(
    provider: CapabilityProvider,
    consumer: CapabilityConsumer,
    context: CapabilityContext
  ): boolean {
    const connector = this.connectors.get(provider.name)
    if (!connector) return false
    
    try {
      const ok = connector.disconnect(provider, consumer)
      
      if (ok) {
        const key = `${context.id}:${provider.name}`
        const key2 = `${context.id}:${consumer.capabilityName}`
        const connectionSet = this.connections.get(key)
        
        connectionSet?.delete(key2)
        
        if (connectionSet?.size === 0) {
          this.connections.delete(key)
        }
        
        this.logger.info(`🔌 Disconnected capability '${provider.name}' in context '${context.id}'`)
      }
      
      return ok
    } catch (e) {
      this.logger.error(`Failed to disconnect capability '${provider.name}':`, e)
      return false
    }
  }

  isCapabilityConnected(
    provider: CapabilityProvider,
    consumer: CapabilityConsumer,
    _context: CapabilityContext
  ): boolean {
    const connector = this.connectors.get(provider.name)
    return !!connector && connector.isConnected(provider, consumer)
  }

  autoConnectCapabilities(context: CapabilityContext): void {
    for (const consumer of context.consumers.values()) {
      const provider = this.findProviderInContext(context, consumer.capabilityName)
      if (provider) {
        this.connectCapability(provider, consumer, context)
      }
    }
    
    // 递归处理子上下文
    context.children.forEach(child => this.autoConnectCapabilities(child))
  }

  disconnectAllCapabilities(context: CapabilityContext): void {
    for (const [key, connectionSet] of Array.from(this.connections.entries())) {
      if (key.startsWith(`${context.id}:`)) {
        const [, capabilityName] = key.split(':')
        const provider = Array.from(context.providers).find(p => p.name === capabilityName)
        
        if (provider) {
          for (const connectionKey of connectionSet) {
            const [, consumerName] = connectionKey.split(':')
            if (consumerName) {
              const consumer = context.consumers.get(consumerName)
              if (consumer) {
                this.disconnectCapability(provider, consumer, context)
              }
            }
          }
        }
      }
    }
    
    // 递归处理子上下文
    context.children.forEach(child => this.disconnectAllCapabilities(child))
  }

  private findProviderInContext(
    context: CapabilityContext,
    name: string
  ): CapabilityProvider | undefined {
    // 在当前上下文中查找
    for (const provider of Array.from(context.providers)) {
      if (provider.name === name) {
        return provider
      }
    }
    
    // 在父上下文中递归查找
    if (context.parent) {
      return this.findProviderInContext(context.parent, name)
    }
    
    return undefined
  }
}

/**
 * 创建能力管理器实例
 */
export function createCapabilityManager(): CapabilityManager {
  return new CapabilityManager()
}
