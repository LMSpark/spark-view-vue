import type { SparkCapabilityProvider, SparkCapabilityConsumer, SparkComponentContext } from '../types/spark-component.js'
import { Logger } from './logger.js'

export interface SparkCapabilityConnector {
  connect(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean
  disconnect(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean
  isConnected(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean
}

class DataFlowConnector implements SparkCapabilityConnector {
  connect(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean {
    try {
      const pImpl: any = provider.implementation
      const cImpl: any = consumer.implementation
      if (typeof pImpl.addListener === 'function' && typeof cImpl.onData === 'function') {
        pImpl.addListener(cImpl.onData)
        return true
      }
    } catch (e) {
      Logger().error('Failed to connect data flow:', e)
    }
    return false
  }
  disconnect(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean {
    try {
      const pImpl: any = provider.implementation
      const cImpl: any = consumer.implementation
      if (typeof pImpl.removeListener === 'function') {
        pImpl.removeListener(cImpl.onData)
        return true
      }
    } catch (e) {
      Logger().error('Failed to disconnect data flow:', e)
    }
    return false
  }
  isConnected(_provider: SparkCapabilityProvider, _consumer: SparkCapabilityConsumer): boolean { return false }
}

class EventConnector implements SparkCapabilityConnector {
  connect(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean {
    try {
      const pImpl: any = provider.implementation
      const cImpl: any = consumer.implementation
      if (typeof pImpl.addEventListener === 'function' && typeof cImpl.onEvent === 'function') {
        pImpl.addEventListener(cImpl.onEvent)
        return true
      }
    } catch (e) {
      Logger().error('Failed to connect event:', e)
    }
    return false
  }
  disconnect(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean {
    try {
      const pImpl: any = provider.implementation
      const cImpl: any = consumer.implementation
      if (typeof pImpl.removeEventListener === 'function') {
        pImpl.removeEventListener(cImpl.onEvent)
        return true
      }
    } catch (e) {
      Logger().error('Failed to disconnect event:', e)
    }
    return false
  }
  isConnected(_provider: SparkCapabilityProvider, _consumer: SparkCapabilityConsumer): boolean { return false }
}

class MethodConnector implements SparkCapabilityConnector {
  connect(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean {
    try {
      const pImpl: any = provider.implementation || {}
      const cImpl: any = consumer.implementation || {}
      Object.keys(consumer.interface || {}).forEach(k => {
        if (typeof pImpl[k] === 'function') cImpl[k] = pImpl[k].bind(pImpl)
      })
      return true
    } catch (e) {
      Logger().error('Failed to connect method:', e)
      return false
    }
  }
  disconnect(_provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean {
    try {
      Object.keys(consumer.interface || {}).forEach(k => {
        const cImpl: any = consumer.implementation
        if (cImpl && cImpl[k]) delete cImpl[k]
      })
      return true
    } catch (e) {
      Logger().error('Failed to disconnect method:', e)
      return false
    }
  }
  isConnected(_provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean {
    return Object.keys(consumer.interface || {}).some(k => typeof (consumer.implementation as any)?.[k] === 'function')
  }
}

class SparkCapabilityManager {
  private connectors = new Map<string, SparkCapabilityConnector>()
  private connections = new Map<string, Set<string>>()
  private logger = Logger()

  registerConnector(name: string, connector: SparkCapabilityConnector) {
    this.connectors.set(name, connector)
  }

  unregisterConnector(name: string) {
    return this.connectors.delete(name)
  }

  connectCapability(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer, context: SparkComponentContext): boolean {
    let connector = this.connectors.get(provider.name)
    if (!connector) {
      // auto-detect
      connector = new DataFlowConnector() as any
      this.connectors.set(provider.name, connector!)
      this.logger.info(`⚙️ Auto-registered connector for capability '${provider.name}'`)
    }
    try {
      const ok = connector.connect(provider, consumer)
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

  disconnectCapability(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer, context: SparkComponentContext): boolean {
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

  isCapabilityConnected(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer, context: SparkComponentContext): boolean {
    const connector = this.connectors.get(provider.name)
    return !!connector && connector.isConnected(provider, consumer)
  }

  autoConnectCapabilities(context: SparkComponentContext) {
    for (const consumer of context.consumers.values()) {
      const provider = this.findProviderInContext(context, consumer.capabilityName)
      if (provider) this.connectCapability(provider, consumer, context)
    }
    context.children.forEach(c => this.autoConnectCapabilities(c))
  }

  private findProviderInContext(context: SparkComponentContext, name: string): SparkCapabilityProvider | undefined {
    for (const p of Array.from(context.providers)) if (p.name === name) return p
    if (context.parent) return this.findProviderInContext(context.parent, name)
    return undefined
  }

  disconnectAllCapabilities(context: SparkComponentContext) {
    for (const [key, set] of Array.from(this.connections.entries())) {
      if (key.startsWith(`${context.id}:`)) {
        const [, capability] = key.split(':')
        const provider = Array.from(context.providers).find(p => p.name === capability)
        if (provider) {
          for (const kv of set) {
            const [, consumerName] = kv.split(':')
            const consumer = context.consumers.get(consumerName)
            if (consumer) this.disconnectCapability(provider, consumer, context)
          }
        }
      }
    }
    context.children.forEach(c => this.disconnectAllCapabilities(c))
  }
}

export const globalCapabilityManager = new SparkCapabilityManager()

export function connectCapability(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer, context: SparkComponentContext) {
  return globalCapabilityManager.connectCapability(provider, consumer, context)
}
export function disconnectCapability(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer, context: SparkComponentContext) {
  return globalCapabilityManager.disconnectCapability(provider, consumer, context)
}
export function autoConnectCapabilities(context: SparkComponentContext) {
  return globalCapabilityManager.autoConnectCapabilities(context)
}

export function disconnectAllCapabilities(context: SparkComponentContext) {
  return globalCapabilityManager.disconnectAllCapabilities(context)
}

export function getGlobalCapabilityManager() {
  return globalCapabilityManager
}