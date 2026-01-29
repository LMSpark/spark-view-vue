/**
 * 组件配置接口 - 统一的组件描述
 * 简化版：统一使用 children 逻辑，移除 slots 概念
 */
export interface SparkComponentConfig {
    /** 组件类型标识符 */
    type: string;
    /** 组件ID，唯一标识 */
    id?: string;
    /** 子组件配置 - 统一使用 children */
    children?: SparkComponentConfig[];
    /** 组件属性 */
    props?: Record<string, unknown>;
    /** 组件事件 */
    events?: Record<string, (...args: unknown[]) => unknown>;
    /** 组件样式 */
    style?: Record<string, unknown>;
    /** 组件类名 */
    class?: string | string[];
    /** 是否可见 */
    visible?: boolean;
    /** 是否禁用 */
    disabled?: boolean;
    /** 权限控制 */
    permissions?: string[];
    /** 自定义数据 */
    data?: Record<string, unknown>;
    /** 允许任意其他属性（用于 EJ2 组件特定属性） */
    [key: string]: unknown;
}
/**
 * 组件上下文接口 - 组件运行时上下文
 */
export interface SparkComponentContext {
    /** 组件ID */
    id: string;
    /** 组件类型 */
    type: string;
    /** 父组件上下文 */
    parent?: SparkComponentContext | undefined;
    /** 子组件上下文列表 */
    children: SparkComponentContext[];
    /** 组件配置 */
    config: SparkComponentConfig;
    /** 组件实例 */
    instance?: unknown;
    /** 组件状态 */
    state: Record<string, unknown>;
    /** 组件能力提供者 */
    providers: Set<SparkCapabilityProvider>;
    /** 组件能力消费者 */
    consumers: Map<string, SparkCapabilityConsumer>;
    /** provider 注册监听器（用于 late-binding） */
    providerListeners?: Map<string, Set<(provider: SparkCapabilityProvider) => void>>;
}
/**
 * 能力提供者接口 - 组件提供的能力
 */
export interface SparkCapabilityProvider {
    /** 能力名称 */
    name: string;
    /** 能力版本 */
    version: string;
    /** 能力描述 */
    description?: string;
    /** 提供的能力接口 */
    interface: Record<string, unknown>;
    /** 能力实现 */
    implementation: unknown;
}
/**
 * 能力消费者接口 - 组件消费的能力
 */
export interface SparkCapabilityConsumer {
    /** 消费的能力名称 */
    capabilityName: string;
    /** 最小版本要求 */
    minVersion?: string;
    /** 消费接口 */
    interface: Record<string, unknown>;
    /** 消费实现 */
    implementation: unknown;
}
/**
 * 组件注册器接口 - 管理组件注册
 */
export interface SparkComponentRegistry {
    /** 注册组件 */
    register(type: string, component: SparkComponentDefinition): void;
    /** 获取组件定义 */
    get(type: string): SparkComponentDefinition | undefined;
    /** 检查组件是否存在 */
    has(type: string): boolean;
    /** 获取所有已注册的组件类型 */
    getAllTypes(): string[];
}
/**
 * 组件定义接口 - 组件的完整定义
 */
export type Component = unknown;
export interface SparkComponentDefinition {
    /** 组件类型 */
    type: string;
    /** 组件名称 */
    name: string;
    /** 组件描述 */
    description?: string;
    /** 组件版本 */
    version: string;
    /** 组件实现 */
    component: Component;
    /** 可选的自定义渲染函数（供测试/自定义 renderer 使用） */
    renderer?: (config: SparkComponentConfig, context: SparkComponentContext) => unknown;
    /** 组件配置验证器 */
    validator?: (config: SparkComponentConfig) => boolean;
    /** 组件默认配置 */
    defaultConfig?: Partial<SparkComponentConfig>;
    /** 组件能力提供者 */
    providers?: SparkCapabilityProvider[];
    /** 组件能力消费者 */
    consumers?: SparkCapabilityConsumer[];
    /** 组件元数据 */
    metadata?: Record<string, unknown>;
}
/**
 * 组件渲染器接口 - 负责组件渲染
 */
export interface SparkComponentRenderer {
    /** 渲染组件 */
    render(config: SparkComponentConfig, context: SparkComponentContext): unknown;
    /** 渲染子组件 */
    renderChildren(children: SparkComponentConfig[], context: SparkComponentContext): unknown[];
    /** 更新组件 */
    update(instance: unknown, config: SparkComponentConfig, context: SparkComponentContext): void;
    /** 销毁组件 */
    destroy(instance: unknown): void;
}
/**
 * 组件生命周期钩子
 */
export interface SparkComponentLifecycle {
    /** 组件创建前 */
    beforeCreate?: (config: SparkComponentConfig, context: SparkComponentContext) => void;
    /** 组件创建后 */
    created?: (instance: unknown, context: SparkComponentContext) => void;
    /** 组件挂载前 */
    beforeMount?: (instance: unknown, context: SparkComponentContext) => void;
    /** 组件挂载后 */
    mounted?: (instance: unknown, context: SparkComponentContext) => void;
    /** 组件更新前 */
    beforeUpdate?: (instance: unknown, config: SparkComponentConfig, context: SparkComponentContext) => void;
    /** 组件更新后 */
    updated?: (instance: unknown, context: SparkComponentContext) => void;
    /** 组件卸载前 */
    beforeUnmount?: (instance: unknown, context: SparkComponentContext) => void;
    /** 组件卸载后 */
    unmounted?: (instance: unknown, context: SparkComponentContext) => void;
}
export declare class SparkComponentManager {
    private renderer;
    private contexts;
    constructor(_registry: SparkComponentRegistry, renderer: SparkComponentRenderer);
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
     * 注销并销毁上下文（清理能力连接、从父节点移除、删除子上下文）
     */
    destroyContext(id: string): boolean;
    /**
     * 注册能力提供者
     */
    registerProvider(context: SparkComponentContext, provider: SparkCapabilityProvider): void;
    /**
     * 将外部创建的上下文注册到管理器（用于组合式 API 创建的上下文）
     */
    registerContext(context: SparkComponentContext): void;
    /**
     * 获取能力提供者
     */
    getProvider(context: SparkComponentContext, capabilityName: string): SparkCapabilityProvider | undefined;
    /**
     * 生成唯一ID
     */
    private generateId;
}
/**
 * 深度克隆配置
 */
export declare function deepCloneConfig(config: SparkComponentConfig): SparkComponentConfig;
/**
 * 合并配置
 */
export declare function mergeConfigs(base: SparkComponentConfig, override: Partial<SparkComponentConfig>): SparkComponentConfig;
/**
 * 验证组件配置
 */
export declare function validateConfig(config: SparkComponentConfig, definition?: SparkComponentDefinition): boolean;
/**
 * 创建组件树
 */
export declare function createComponentTree(config: SparkComponentConfig): SparkComponentConfig;
/**
 * EJ2 Grid 配置接口
 */
export interface SparkEJ2GridConfig extends SparkComponentConfig {
    type: 'spark-ej2-grid';
    /** 数据源 */
    dataSource?: unknown[];
    /** 是否允许分页 */
    allowPaging?: boolean;
    /** 分页设置 */
    pageSettings?: {
        pageSize?: number;
        pageSizes?: number[];
        currentPage?: number;
    };
    /** 是否允许排序 */
    allowSorting?: boolean;
    /** 是否允许筛选 */
    allowFiltering?: boolean;
    /** 是否允许分组 */
    allowGrouping?: boolean;
    /** 高度 */
    height?: string | number;
    /** 宽度 */
    width?: string | number;
}
/**
 * EJ2 Column 配置接口
 */
export interface SparkEJ2ColumnConfig extends SparkComponentConfig {
    type: 'spark-ej2-column';
    /** 字段名 */
    field?: string;
    /** 列标题 */
    headerText?: string;
    /** 宽度 */
    width?: string | number;
    /** 文本对齐方式 */
    textAlign?: 'Left' | 'Center' | 'Right' | 'Justify';
    /** 格式化 */
    format?: string;
    /** 模板 */
    template?: unknown;
    /** 是否可见 */
    visible?: boolean;
    /** 是否允许排序 */
    allowSorting?: boolean;
    /** 是否允许筛选 */
    allowFiltering?: boolean;
}
