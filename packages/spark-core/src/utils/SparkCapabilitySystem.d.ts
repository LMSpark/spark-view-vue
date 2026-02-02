import type { CapabilityProvider, CapabilityConsumer, ComponentContext } from '../types/spark-component.js';
export interface CapabilityConnector {
    connect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean;
    disconnect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean;
    isConnected(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean;
}
export declare class EventConnector implements CapabilityConnector {
    connect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean;
    disconnect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean;
    isConnected(_provider: CapabilityProvider, _consumer: CapabilityConsumer): boolean;
}
export declare class MethodConnector implements CapabilityConnector {
    connect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean;
    disconnect(_provider: CapabilityProvider, consumer: CapabilityConsumer): boolean;
    isConnected(_provider: CapabilityProvider, consumer: CapabilityConsumer): boolean;
}
declare class SparkCapabilityManager {
    private connectors;
    private connections;
    private logger;
    registerConnector(name: string, connector: CapabilityConnector): void;
    unregisterConnector(name: string): boolean;
    connectCapability(provider: CapabilityProvider, consumer: CapabilityConsumer, context: ComponentContext): boolean;
    disconnectCapability(provider: CapabilityProvider, consumer: CapabilityConsumer, context: ComponentContext): boolean;
    isCapabilityConnected(provider: CapabilityProvider, consumer: CapabilityConsumer, _context: ComponentContext): boolean;
    autoConnectCapabilities(context: ComponentContext): void;
    private findProviderInContext;
    disconnectAllCapabilities(context: ComponentContext): void;
}
export declare const capabilityManager: SparkCapabilityManager;
export {};
//# sourceMappingURL=SparkCapabilitySystem.d.ts.map