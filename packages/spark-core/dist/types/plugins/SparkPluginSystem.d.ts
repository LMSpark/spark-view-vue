/**
 * SPARK 插件系统 - 组件功能的插件化扩展
 */
import type { SparkComponentConfig, SparkComponentContext, SparkCapabilityProvider, SparkCapabilityConsumer } from '../types/spark-component';
/**
 * 插件接口
 */
export interface SparkPlugin {
    /** 插件名称 */
    name: string;
    /** 插件版本 */
    version: string;
    /** 插件描述 */
    description?: string;
    /** 插件安装 */
    install(manager: SparkPluginManager): void;
    /** 插件卸载 */
    uninstall?(manager: SparkPluginManager): void;
}
/**
 * 插件钩子接口
 */
export interface SparkPluginHooks {
    /** 组件创建前 */
    beforeComponentCreate?: (config: SparkComponentConfig, context: SparkComponentContext) => void;
    /** 组件创建后 */
    afterComponentCreate?: (instance: unknown, context: SparkComponentContext) => void;
    /** 组件挂载前 */
    beforeComponentMount?: (instance: unknown, context: SparkComponentContext) => void;
    /** 组件挂载后 */
    afterComponentMount?: (instance: unknown, context: SparkComponentContext) => void;
    /** 组件更新前 */
    beforeComponentUpdate?: (instance: unknown, config: SparkComponentConfig, context: SparkComponentContext) => void;
    /** 组件更新后 */
    afterComponentUpdate?: (instance: unknown, context: SparkComponentContext) => void;
    /** 组件卸载前 */
    beforeComponentUnmount?: (instance: unknown, context: SparkComponentContext) => void;
    /** 组件卸载后 */
    afterComponentUnmount?: (instance: unknown, context: SparkComponentContext) => void;
    /** 能力连接前 */
    beforeCapabilityConnect?: (provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer, context: SparkComponentContext) => void;
    /** 能力连接后 */
    afterCapabilityConnect?: (provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer, context: SparkComponentContext) => void;
    /** 能力断开前 */
    beforeCapabilityDisconnect?: (provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer, context: SparkComponentContext) => void;
    /** 能力断开后 */
    afterCapabilityDisconnect?: (provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer, context: SparkComponentContext) => void;
}
/**
 * 插件管理器
 */
export declare class SparkPluginManager {
    private plugins;
    private hooks;
    /**
     * 安装插件
     */
    install(plugin: SparkPlugin): void;
    /**
     * 卸载插件
     */
    uninstall(pluginName: string): boolean;
    /**
     * 获取插件
     */
    get(pluginName: string): SparkPlugin | undefined;
    /**
     * 检查插件是否已安装
     */
    has(pluginName: string): boolean;
    /**
     * 获取所有已安装的插件
     */
    getAll(): SparkPlugin[];
    /**
     * 注册钩子
     */
    registerHook<K extends keyof SparkPluginHooks>(hookName: K, hook: NonNullable<SparkPluginHooks[K]>): void;
    /**
     * 执行钩子
     */
    executeHook<K extends keyof SparkPluginHooks>(hookName: K, ...args: Parameters<NonNullable<SparkPluginHooks[K]>>): Promise<void>;
    /**
     * 清空所有插件
     */
    clear(): void;
}
/**
 * 调试插件 - 提供组件调试功能
 */
export declare class SparkDebugPlugin implements SparkPlugin {
    name: string;
    version: string;
    description: string;
    install(manager: SparkPluginManager): void;
}
/**
 * 性能监控插件 - 监控组件性能
 */
export declare class SparkPerformancePlugin implements SparkPlugin {
    name: string;
    version: string;
    description: string;
    private metrics;
    install(manager: SparkPluginManager): void;
    /**
     * 获取性能指标
     */
    getMetrics(componentId: string): {
        createTime: number;
        mountTime?: number | undefined;
        updateCount: number;
        lastUpdateTime?: number | undefined;
    } | undefined;
    /**
     * 获取所有性能指标
     */
    getAllMetrics(): Map<string, {
        createTime: number;
        mountTime?: number | undefined;
        updateCount: number;
        lastUpdateTime?: number | undefined;
    }>;
}
/**
 * 错误处理插件 - 统一错误处理
 */
export declare class SparkErrorHandlingPlugin implements SparkPlugin {
    name: string;
    version: string;
    description: string;
    private errorHandlers;
    install(manager: SparkPluginManager): void;
    /**
     * 添加错误处理器
     */
    addErrorHandler(handler: (error: Error, context: SparkComponentContext) => void): void;
    /**
     * 移除错误处理器
     */
    removeErrorHandler(handler: (error: Error, context: SparkComponentContext) => void): void;
    /**
     * 报告错误
     */
    private reportError;
}
/**
 * 全局插件管理器实例
 */
export declare const globalPluginManager: SparkPluginManager;
/**
 * 便捷函数
 */
export declare function installSparkPlugin(plugin: SparkPlugin): void;
export declare function uninstallSparkPlugin(pluginName: string): boolean;
export declare function getSparkPlugin(pluginName: string): SparkPlugin | undefined;
