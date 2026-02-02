import type { ComponentConfig, ComponentRegistry } from '../types/spark-component.js';
import type { Component } from 'vue';
export type ComponentResolver = (type: string) => unknown | null;
export type RenderResult = {
    type: 'vue-component' | 'native-element' | 'text' | 'fragment';
    component?: Component;
    props?: Record<string, unknown>;
    children?: RenderResult[];
    text?: string;
};
/**
 * Unified recursive renderer for Spark components.
 * Handles component tree rendering with proper recursion and optimization.
 */
export declare class SparkComponentRendererImpl {
    private registry;
    private resolver;
    constructor(registry: ComponentRegistry);
    /**
     * Check if component should update based on config changes
     */
    shouldUpdateComponent(oldCfg: ComponentConfig | null | undefined, newCfg: ComponentConfig | null | undefined): boolean;
    /**
     * Check if children have changed
     */
    haveChildrenChanged(oldChildren: ComponentConfig[], newChildren: ComponentConfig[]): boolean;
    /**
     * Recursively render a component config into a render result tree
     */
    renderComponentTree(config: ComponentConfig): RenderResult;
    /**
     * Render a single component (non-recursive)
     */
    renderComponent(config: ComponentConfig): RenderResult;
    /**
     * Get children configs for a component config
     */
    getChildrenForConfig(config: ComponentConfig): ComponentConfig[];
    /**
     * Check if a component type is registered
     */
    isComponentRegistered(type: string): boolean;
    /**
     * Get all registered component types
     */
    getRegisteredTypes(): string[];
}
export declare class SparkComponentRenderer {
    /**
     * Check if component should update
     */
    static shouldUpdateComponent(oldCfg: ComponentConfig | null | undefined, newCfg: ComponentConfig | null | undefined): boolean;
    /**
     * Check if children have changed
     */
    static haveChildrenChanged(oldChildren: ComponentConfig[], newChildren: ComponentConfig[]): boolean;
    /**
     * Resolve a renderer for config
     */
    static resolveRendererForConfig(config: ComponentConfig, resolver: ComponentResolver): unknown | null;
    /**
     * Create resolver from registry
     */
    static createResolverFromRegistry(registry: ComponentRegistry): ComponentResolver;
    /**
     * Check if type is registered
     */
    static isTypeRegistered(registry: ComponentRegistry, type: string): boolean;
    /**
     * Get children for config
     */
    static getChildrenForConfig(config: ComponentConfig): ComponentConfig[];
}
//# sourceMappingURL=SparkComponentRenderer.d.ts.map