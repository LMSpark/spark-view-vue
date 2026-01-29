/**
 * SPARK 能力系统 - 组件间能力提供和消费的管理
 */
import type { SparkCapabilityProvider, SparkCapabilityConsumer, SparkComponentContext } from '../types/spark-component';
/**
 * 能力连接器接口
 */
export interface SparkCapabilityConnector {
    /** 连接提供者和消费者 */
    connect(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean;
    /** 断开连接 */
    disconnect(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean;
    /** 检查连接状态 */
    isConnected(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean;
}
/**
 * 能力管理器
 */
export declare class SparkCapabilityManager {
    private connectors;
    private connections;
    /**
     * 注册能力连接器
     */
    registerConnector(capabilityName: string, connector: SparkCapabilityConnector): void;
    /**
     * 注销能力连接器
     */
    unregisterConnector(capabilityName: string): boolean;
    /**
     * 连接能力
     */
    connectCapability(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer, context: SparkComponentContext): boolean;
    /**
     * 断开能力连接
     */
    disconnectCapability(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer, context: SparkComponentContext): boolean;
    /**
     * 检查能力连接状态
     */
    isCapabilityConnected(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer, _context: SparkComponentContext): boolean;
    /**
     * 自动连接上下文中的能力
     */
    autoConnectCapabilities(context: SparkComponentContext): void;
    /**
     * 在上下文中查找提供者
     */
    private findProviderInContext;
    /**
     * 断开上下文中的所有能力连接
     */
    disconnectAllCapabilities(context: SparkComponentContext): void;
}
/**
 * 数据流能力连接器
 */
export declare class DataFlowConnector implements SparkCapabilityConnector {
    connect(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean;
    disconnect(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean;
    isConnected(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean;
}
/**
 * 事件能力连接器
 */
export declare class EventConnector implements SparkCapabilityConnector {
    connect(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean;
    disconnect(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean;
    isConnected(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean;
}
export declare class MethodConnector implements SparkCapabilityConnector {
    connect(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean;
    disconnect(_provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean;
    isConnected(_provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer): boolean;
}
/**
 * 全局能力管理器实例
 */
export declare const globalCapabilityManager: SparkCapabilityManager;
/**
 * 便捷函数
 */
export declare function connectCapability(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer, context: SparkComponentContext): boolean;
export declare function disconnectCapability(provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer, context: SparkComponentContext): boolean;
export declare function autoConnectCapabilities(context: SparkComponentContext): void;
import { registerGlobalProvider as _registerGlobalProvider, getGlobalProvider as _getGlobalProvider, getOrCreateNoopProvider as _getOrCreateNoopProvider } from './GlobalProviderRegistry';
export declare const registerGlobalProvider: typeof _registerGlobalProvider;
export declare const getGlobalProvider: typeof _getGlobalProvider;
export declare const getOrCreateNoopProvider: typeof _getOrCreateNoopProvider;
export declare function disconnectAllCapabilities(context: SparkComponentContext): void;
export declare function getGlobalCapabilityManager(): SparkCapabilityManager;
