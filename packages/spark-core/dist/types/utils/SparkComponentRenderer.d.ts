/**
 * SPARK 组件渲染器 - 负责组件的渲染和管理
 */
import type { SparkComponentRenderer, SparkComponentConfig, SparkComponentContext } from '../types/spark-component';
export declare class SparkComponentRendererImpl implements SparkComponentRenderer {
    private renderedComponents;
    /**
     * 渲染组件
     */
    render(config: SparkComponentConfig, context: SparkComponentContext): unknown;
    /**
     * 渲染子组件
     */
    renderChildren(children: SparkComponentConfig[], parentContext: SparkComponentContext): unknown[];
    /**
     * 更新组件
     */
    update(instance: unknown, config: SparkComponentConfig, context: SparkComponentContext): void;
    /**
     * 增量更新子组件
     */
    private updateChildrenIncrementally;
    /**
     * 判断组件是否需要更新
     */
    private shouldUpdateComponent;
    /**
     * 检查子组件是否发生变化
     */
    private haveChildrenChanged;
    /**
     * 销毁组件
     */
    destroy(instance: unknown): void;
    /**
     * 创建组件实例
     */
    private createComponentInstance;
    /**
     * 验证组件配置
     */
    private validateConfig;
    /**
     * 根据实例查找上下文ID
     */
    private findContextIdByInstance;
    /**
     * 获取渲染的组件
     */
    getRenderedComponent(contextId: string): unknown;
    /**
     * 获取所有渲染的组件
     */
    getAllRenderedComponents(): Map<string, unknown>;
    /**
     * 清空渲染缓存
     */
    clearRenderCache(): void;
}
/**
 * 全局组件渲染器实例
 */
export declare const globalComponentRenderer: SparkComponentRendererImpl;
/**
 * 便捷渲染函数
 */
export declare function renderSparkComponent(config: SparkComponentConfig, context?: SparkComponentContext): unknown;
