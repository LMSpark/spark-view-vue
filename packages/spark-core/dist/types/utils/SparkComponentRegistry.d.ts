/**
 * SPARK 组件注册器 - 管理组件注册和发现
 */
import type { SparkComponentRegistry, SparkComponentDefinition } from '../types/spark-component';
export declare class SparkComponentRegistryImpl implements SparkComponentRegistry {
    private components;
    /**
     * 注册组件
     */
    register(type: string, definition: SparkComponentDefinition): void;
    /**
     * 获取组件定义
     */
    get(type: string): SparkComponentDefinition | undefined;
    /**
     * 检查组件是否存在
     */
    has(type: string): boolean;
    /**
     * 获取所有已注册的组件类型
     */
    getAllTypes(): string[];
    /**
     * 获取所有组件定义
     */
    getAllDefinitions(): SparkComponentDefinition[];
    /**
     * 注销组件
     */
    unregister(type: string): boolean;
    /**
     * 清空所有注册
     */
    clear(): void;
    /**
     * 验证组件定义
     */
    private validateDefinition;
    /**
     * 验证版本格式 (semver)
     */
    private isValidVersion;
    /**
     * 查找兼容的提供者
     */
    findCompatibleProviders(capabilityName: string, minVersion?: string): SparkComponentDefinition[];
    /**
     * 检查版本兼容性
     */
    private isVersionCompatible;
}
/**
 * 全局组件注册器实例
 */
export declare const globalComponentRegistry: SparkComponentRegistryImpl;
/**
 * 便捷注册函数
 */
export declare function registerSparkComponent(definition: SparkComponentDefinition): void;
/**
 * 便捷获取函数 - 返回组件构造函数用于动态渲染
 */
export declare function getSparkComponent(type: string): any;
/**
 * 批量注册组件
 */
export declare function registerSparkComponents(definitions: SparkComponentDefinition[]): void;
/**
 * 初始化 SPARK 组件系统
 * 注意：此函数在核心包中是空的，具体的组件注册应在应用层完成
 */
export declare function initializeSparkComponents(): Promise<void>;
/**
 * 检查SPARK组件系统是否已初始化
 */
export declare function isSparkComponentsInitialized(): boolean;
