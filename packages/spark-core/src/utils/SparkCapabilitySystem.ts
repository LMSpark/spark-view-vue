import type { CapabilityProvider, CapabilityConsumer, ComponentContext } from '../types/spark-component.js'
import type { Implementation, AnyFunction } from '../types/common.js'
import { Logger } from './logger.js'

export interface CapabilityConnector {
  connect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean
  disconnect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean
  isConnected(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean
}

class DataFlowConnector implements CapabilityConnector {
  connect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean {
    try {
      const pImpl = provider.implementation as Implementation | undefined
      const cImpl = consumer.implementation as Implementation | undefined
      const addListener = pImpl && (pImpl['addListener'] as AnyFunction | undefined)
      const onData = cImpl && (cImpl['onData'] as AnyFunction | undefined)
      if (addListener && typeof addListener === 'function' && onData && typeof onData === 'function') {
        addListener(onData)
        return true
      }
    } catch (e: unknown) {
      Logger().error('Failed to connect data flow:', String(e))
    }
    return false
  }
  disconnect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean {
    try {
      const pImpl = provider.implementation as Implementation | undefined
      const cImpl = consumer.implementation as Implementation | undefined
      const removeListener = pImpl && (pImpl['removeListener'] as AnyFunction | undefined)
      const onData = cImpl && (cImpl['onData'] as AnyFunction | undefined)
      if (removeListener && typeof removeListener === 'function' && onData && typeof onData === 'function') {
        removeListener(onData)
        return true
      }
    } catch (e: unknown) {
      Logger().error('Failed to disconnect data flow:', String(e))
    }
    return false
  }
  isConnected(_provider: CapabilityProvider, _consumer: CapabilityConsumer): boolean { return false }
}

export class EventConnector implements CapabilityConnector {
  connect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean {
    try {
      const pImpl = provider.implementation as Implementation | undefined
      const cImpl = consumer.implementation as Implementation | undefined
      const addEvent = pImpl && (pImpl['addEventListener'] as AnyFunction | undefined)
      const onEvent = cImpl && (cImpl['onEvent'] as AnyFunction | undefined)
      if (addEvent && typeof addEvent === 'function' && onEvent && typeof onEvent === 'function') {
        addEvent(onEvent)
        return true
      }
    } catch (e: unknown) {
      Logger().error('Failed to connect event:', String(e))
    }
    return false
  }
  disconnect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean {
    try {
      const pImpl = provider.implementation as Implementation | undefined
      const cImpl = consumer.implementation as Implementation | undefined
      const removeEvent = pImpl && (pImpl['removeEventListener'] as AnyFunction | undefined)
      const onEvent = cImpl && (cImpl['onEvent'] as AnyFunction | undefined)
      if (removeEvent && typeof removeEvent === 'function' && onEvent && typeof onEvent === 'function') {
        removeEvent(onEvent)
        return true
      }
    } catch (e: unknown) {
      Logger().error('Failed to disconnect event:', String(e))
    }
    return false
  }
  isConnected(_provider: CapabilityProvider, _consumer: CapabilityConsumer): boolean { return false }
}

export class MethodConnector implements CapabilityConnector {
  connect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean {
    try {
      const pImpl = (provider.implementation || {}) as Implementation
      const cImpl = (consumer.implementation || {}) as Implementation
      Object.keys(consumer.interface || {}).forEach(k => {
        const fn = pImpl[k] as AnyFunction | undefined
        if (typeof fn === 'function') (cImpl as Record<string, unknown>)[k] = fn.bind(pImpl as unknown as object) as unknown
      })
      return true
    } catch (e: unknown) {
      Logger().error('Failed to connect method:', String(e))
      return false
    }
  }
  disconnect(_provider: CapabilityProvider, consumer: CapabilityConsumer): boolean {
    try {
      Object.keys(consumer.interface || {}).forEach(k => {
        const cImpl = consumer.implementation as Implementation | undefined
        if (cImpl && (cImpl as Record<string, unknown>)[k]) delete (cImpl as Record<string, unknown>)[k]
      })
      return true
    } catch (e: unknown) {
      Logger().error('Failed to disconnect method:', String(e))
      return false
    }
  }
  isConnected(_provider: CapabilityProvider, consumer: CapabilityConsumer): boolean {
    return Object.keys(consumer.interface || {}).some(k => typeof ((consumer.implementation as Implementation | undefined) as Record<string, unknown>)?.[k] === 'function')
  }
}

class SparkCapabilityManager {
  private connectors = new Map<string, CapabilityConnector>()
  private connections = new Map<string, Set<string>>()
  private logger = Logger()

  registerConnector(name: string, connector: CapabilityConnector) {
    this.connectors.set(name, connector)
  }

  unregisterConnector(name: string) {
    return this.connectors.delete(name)
  }

  connectCapability(provider: CapabilityProvider, consumer: CapabilityConsumer, context: ComponentContext): boolean {
    let connector = this.connectors.get(provider.name)
    if (!connector) {
      // auto-detect
      connector = new DataFlowConnector()
      this.connectors.set(provider.name, connector)
      this.logger.info(`⚙️ Auto-registered connector for capability '${provider.name}'`)
    }
    try {
      const ok = connector!.connect(provider, consumer)
      if (ok) {
        const key = `${context.id}:${provider.name}`
        const key2 = `${context.id}:${consumer.capabilityName}`
        if (!this.connections.has(key)) this.connections.set(key, new Set())
        this.connections.get(key)!.add(key2)
        this.logger.info(`🔗 Connected capability '${provider.name}' in context '${context.id}'`)
      }
      return ok
    } catch (e) {
      this.logger.error(`Failed to connect capability '${provider.name}':`, e)
      return false
    }
  }

  disconnectCapability(provider: CapabilityProvider, consumer: CapabilityConsumer, context: ComponentContext): boolean {
    const connector = this.connectors.get(provider.name)
    if (!connector) return false
    try {
      const ok = connector.disconnect(provider, consumer)
      if (ok) {
        const key = `${context.id}:${provider.name}`
        const key2 = `${context.id}:${consumer.capabilityName}`
        const s = this.connections.get(key)
        s?.delete(key2)
        if (s && s.size === 0) this.connections.delete(key)
        this.logger.info(`🔌 Disconnected capability '${provider.name}' in context '${context.id}'`)
      }
      return ok
    } catch (e) {
      this.logger.error(`Failed to disconnect capability '${provider.name}':`, e)
      return false
    }
  }

  isCapabilityConnected(provider: CapabilityProvider, consumer: CapabilityConsumer, _context: ComponentContext): boolean {
    const connector = this.connectors.get(provider.name)
    return !!connector && connector.isConnected(provider, consumer)
  }

  autoConnectCapabilities(context: ComponentContext) {
    for (const consumer of context.consumers.values()) {
      const provider = this.findProviderInContext(context, consumer.capabilityName)
      if (provider) this.connectCapability(provider, consumer, context)
    }
    context.children.forEach(c => this.autoConnectCapabilities(c))
  }

  private findProviderInContext(context: ComponentContext, name: string): CapabilityProvider | undefined {
    for (const p of Array.from(context.providers) as CapabilityProvider[]) if (p.name === name) return p
    if (context.parent) return this.findProviderInContext(context.parent, name)
    return undefined
  }

  disconnectAllCapabilities(context: ComponentContext) {
    for (const [key, set] of Array.from(this.connections.entries())) {
      if (key.startsWith(`${context.id}:`)) {
        const [, capability] = key.split(':')
        const provider = Array.from(context.providers).find(p => p.name === capability)
        if (provider) {
          for (const kv of set) {
            const [, consumerName] = kv.split(':')
            if (!consumerName) continue
            const consumer = context.consumers.get(consumerName)
            if (consumer) this.disconnectCapability(provider, consumer, context)
          }
        }
      }
    }
    context.children.forEach(c => this.disconnectAllCapabilities(c))
  }

}

export const capabilityManager = new SparkCapabilityManager()
// NOTE: convenience helpers were removed to avoid duplicating the public namespace API.
// Use `Spark.capabilities()` or `capabilityManager` directly.
