import { Logger } from './logger.js';
class DataFlowConnector {
    connect(provider, consumer) {
        try {
            const pImpl = provider.implementation;
            const cImpl = consumer.implementation;
            const addListener = pImpl && pImpl['addListener'];
            const onData = cImpl && cImpl['onData'];
            if (addListener && typeof addListener === 'function' && onData && typeof onData === 'function') {
                addListener(onData);
                return true;
            }
        }
        catch (e) {
            Logger().error('Failed to connect data flow:', String(e));
        }
        return false;
    }
    disconnect(provider, consumer) {
        try {
            const pImpl = provider.implementation;
            const cImpl = consumer.implementation;
            const removeListener = pImpl && pImpl['removeListener'];
            const onData = cImpl && cImpl['onData'];
            if (removeListener && typeof removeListener === 'function' && onData && typeof onData === 'function') {
                removeListener(onData);
                return true;
            }
        }
        catch (e) {
            Logger().error('Failed to disconnect data flow:', String(e));
        }
        return false;
    }
    isConnected(_provider, _consumer) { return false; }
}
export class EventConnector {
    connect(provider, consumer) {
        try {
            const pImpl = provider.implementation;
            const cImpl = consumer.implementation;
            const addEvent = pImpl && pImpl['addEventListener'];
            const onEvent = cImpl && cImpl['onEvent'];
            if (addEvent && typeof addEvent === 'function' && onEvent && typeof onEvent === 'function') {
                addEvent(onEvent);
                return true;
            }
        }
        catch (e) {
            Logger().error('Failed to connect event:', String(e));
        }
        return false;
    }
    disconnect(provider, consumer) {
        try {
            const pImpl = provider.implementation;
            const cImpl = consumer.implementation;
            const removeEvent = pImpl && pImpl['removeEventListener'];
            const onEvent = cImpl && cImpl['onEvent'];
            if (removeEvent && typeof removeEvent === 'function' && onEvent && typeof onEvent === 'function') {
                removeEvent(onEvent);
                return true;
            }
        }
        catch (e) {
            Logger().error('Failed to disconnect event:', String(e));
        }
        return false;
    }
    isConnected(_provider, _consumer) { return false; }
}
export class MethodConnector {
    connect(provider, consumer) {
        try {
            const pImpl = (provider.implementation ?? {});
            const cImpl = (consumer.implementation ?? {});
            Object.keys(consumer.interface ?? {}).forEach(k => {
                const fn = pImpl[k];
                if (typeof fn === 'function')
                    cImpl[k] = fn.bind(pImpl);
            });
            return true;
        }
        catch (e) {
            Logger().error('Failed to connect method:', String(e));
            return false;
        }
    }
    disconnect(_provider, consumer) {
        try {
            Object.keys(consumer.interface ?? {}).forEach(k => {
                const cImpl = consumer.implementation;
                if (cImpl && cImpl[k])
                    delete cImpl[k];
            });
            return true;
        }
        catch (e) {
            Logger().error('Failed to disconnect method:', String(e));
            return false;
        }
    }
    isConnected(_provider, consumer) {
        return Object.keys(consumer.interface ?? {}).some(k => typeof (consumer.implementation)?.[k] === 'function');
    }
}
class SparkCapabilityManager {
    constructor() {
        this.connectors = new Map();
        this.connections = new Map();
        this.logger = Logger();
    }
    registerConnector(name, connector) {
        this.connectors.set(name, connector);
    }
    unregisterConnector(name) {
        return this.connectors.delete(name);
    }
    connectCapability(provider, consumer, context) {
        let connector = this.connectors.get(provider.name);
        if (!connector) {
            // auto-detect
            connector = new DataFlowConnector();
            this.connectors.set(provider.name, connector);
            this.logger.info(`⚙️ Auto-registered connector for capability '${provider.name}'`);
        }
        try {
            const ok = connector.connect(provider, consumer);
            if (ok) {
                const key = `${context.id}:${provider.name}`;
                const key2 = `${context.id}:${consumer.capabilityName}`;
                if (!this.connections.has(key))
                    this.connections.set(key, new Set());
                this.connections.get(key)?.add(key2);
                this.logger.info(`🔗 Connected capability '${provider.name}' in context '${context.id}'`);
            }
            return ok;
        }
        catch (e) {
            this.logger.error(`Failed to connect capability '${provider.name}':`, e);
            return false;
        }
    }
    disconnectCapability(provider, consumer, context) {
        const connector = this.connectors.get(provider.name);
        if (!connector)
            return false;
        try {
            const ok = connector.disconnect(provider, consumer);
            if (ok) {
                const key = `${context.id}:${provider.name}`;
                const key2 = `${context.id}:${consumer.capabilityName}`;
                const s = this.connections.get(key);
                s?.delete(key2);
                if (s?.size === 0)
                    this.connections.delete(key);
                this.logger.info(`🔌 Disconnected capability '${provider.name}' in context '${context.id}'`);
            }
            return ok;
        }
        catch (e) {
            this.logger.error(`Failed to disconnect capability '${provider.name}':`, e);
            return false;
        }
    }
    isCapabilityConnected(provider, consumer, _context) {
        const connector = this.connectors.get(provider.name);
        return !!connector && connector.isConnected(provider, consumer);
    }
    autoConnectCapabilities(context) {
        for (const consumer of context.consumers.values()) {
            const provider = this.findProviderInContext(context, consumer.capabilityName);
            if (provider)
                this.connectCapability(provider, consumer, context);
        }
        context.children.forEach(c => this.autoConnectCapabilities(c));
    }
    findProviderInContext(context, name) {
        for (const p of Array.from(context.providers))
            if (p.name === name)
                return p;
        if (context.parent)
            return this.findProviderInContext(context.parent, name);
        return undefined;
    }
    disconnectAllCapabilities(context) {
        for (const [key, set] of Array.from(this.connections.entries())) {
            if (key.startsWith(`${context.id}:`)) {
                const [, capability] = key.split(':');
                const provider = Array.from(context.providers).find(p => p.name === capability);
                if (provider) {
                    for (const kv of set) {
                        const [, consumerName] = kv.split(':');
                        if (!consumerName)
                            continue;
                        const consumer = context.consumers.get(consumerName);
                        if (consumer)
                            this.disconnectCapability(provider, consumer, context);
                    }
                }
            }
        }
        context.children.forEach(c => this.disconnectAllCapabilities(c));
    }
}
export const capabilityManager = new SparkCapabilityManager();
// NOTE: convenience helpers were removed to avoid duplicating the public namespace API.
// Use `Spark.capabilities()` or `capabilityManager` directly.
