import type { Plugin, PluginHooks } from '../types/spark-component.js';
declare class SparkPluginManager {
    private plugins;
    private hooks;
    install(plugin: Plugin): void;
    uninstall(name: string): boolean;
    get(name: string): import("../types/spark-component.js").Spark.Plugin | undefined;
    has(name: string): boolean;
    getAll(): import("../types/spark-component.js").Spark.Plugin[];
    registerHook<K extends keyof PluginHooks>(hookName: K, hook: NonNullable<PluginHooks[K]>): void;
    executeHook<K extends keyof PluginHooks>(hookName: K, ...args: Parameters<NonNullable<PluginHooks[K]>>): Promise<void>;
    clear(): void;
}
export declare class SparkDebugPlugin {
    name: string;
    version: string;
    description: string;
    install(m: SparkPluginManager): void;
}
export declare class SparkPerformancePlugin {
    name: string;
    version: string;
    description: string;
    private metrics;
    install(_m: SparkPluginManager): void;
    getMetrics(id: string): unknown;
    getAllMetrics(): Map<string, unknown>;
}
export declare class SparkErrorHandlingPlugin {
    name: string;
    version: string;
    description: string;
    private errorHandlers;
    install(_m: SparkPluginManager): void;
    addErrorHandler(h: unknown): void;
    removeErrorHandler(h: unknown): void;
}
export declare const globalPluginManager: SparkPluginManager;
export declare function installSparkPlugin(p: Plugin): void;
export declare function uninstallSparkPlugin(name: string): boolean;
export declare function getSparkPlugin(name: string): import("../types/spark-component.js").Spark.Plugin | undefined;
export type { Plugin, PluginHooks } from '../types/spark-component.js';
//# sourceMappingURL=SparkPluginSystem.d.ts.map