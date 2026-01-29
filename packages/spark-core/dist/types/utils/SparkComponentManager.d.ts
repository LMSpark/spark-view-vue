/**
 * SPARK 组件管理器 - 统一的组件管理系统
 */
import type { SparkComponentConfig, SparkComponentContext, SparkComponentDefinition, SparkCapabilityProvider } from '../types/spark-component';
export declare class SparkComponentManagerImpl {
    private manager;
    constructor();
    /**
     * 创建组件上下文
     */
    createContext(config: SparkComponentConfig, parent?: SparkComponentContext): SparkComponentContext;
    /**
     * 渲染组件
     */
    render(config: SparkComponentConfig, parentContext?: SparkComponentContext): unknown;
    /**
     * 获取组件上下文
     */
    getContext(id: string): SparkComponentContext | undefined;
    /**
     * 销毁组件上下文
     */
    destroyContext(id: string): boolean;
    /**
     * 注册由外部（组合式 API）创建的上下文到管理器中
     */
    registerContext(context: SparkComponentContext): void;
    /**
     * 注册能力提供者
     */
    registerProvider(context: SparkComponentContext, provider: SparkCapabilityProvider): void;
    /**
     * 获取所有组件上下文
     */
    getAllContexts(): SparkComponentContext[];
    /**
     * 获取能力提供者
     */
    getProvider(context: SparkComponentContext, capabilityName: string): SparkCapabilityProvider | undefined;
    /**
     * 注册组件
     */
    registerComponent(definition: SparkComponentDefinition): void;
    /**
     * 批量注册组件
     */
    registerComponents(definitions: SparkComponentDefinition[]): void;
    /**
     * 获取组件定义
     */
    getComponentDefinition(type: string): SparkComponentDefinition | undefined;
    /**
     * 检查组件是否已注册
     */
    isComponentRegistered(type: string): boolean;
    /**
     * 获取所有已注册的组件类型
     */
    getRegisteredComponentTypes(): string[];
    /**
     * 注销组件
     */
    unregisterComponent(type: string): boolean;
    /**
     * 创建组件树
     */
    createComponentTree(config: SparkComponentConfig): SparkComponentConfig;
    /**
     * 验证组件配置
     */
    validateComponentConfig(config: SparkComponentConfig): boolean;
    /**
     * 获取组件兼容性信息
     */
    getComponentCompatibility(): Record<string, string[]>;
}
/**
 * 全局组件管理器实例
 */
export declare const globalSparkComponentManager: SparkComponentManagerImpl;
export declare function getGlobalSparkComponentManager(): SparkComponentManagerImpl;
/**
 * 便捷函数
 */
export declare function registerSparkComponent(definition: SparkComponentDefinition): void;
export declare function renderSparkComponent(config: SparkComponentConfig, parentContext?: SparkComponentContext): unknown;
export declare function getSparkComponentDefinition(type: string): SparkComponentDefinition | undefined;
export declare function createSparkComponentTree(config: SparkComponentConfig): SparkComponentConfig;
export declare function validateSparkComponentConfig(config: SparkComponentConfig): boolean;
