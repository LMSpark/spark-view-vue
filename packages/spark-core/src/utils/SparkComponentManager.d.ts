import { SparkComponentRendererImpl } from './SparkComponentRenderer.js';
import type { ComponentConfig, ComponentContext, CapabilityProvider, ComponentRegistry, ComponentManager } from '../types/spark-component.js';
export declare class SparkComponentManagerImpl {
    private contexts;
    private renderer;
    private registry;
    private logger;
    constructor(renderer?: SparkComponentRendererImpl, registry?: ComponentRegistry);
    createContext(config: ComponentConfig, parent?: ComponentContext): ComponentContext;
    render(config: ComponentConfig, parentContext?: ComponentContext): unknown;
    renderSingle(config: ComponentConfig): unknown;
    getContext(id: string): ComponentContext | undefined;
    destroyContext(id: string): boolean;
    registerProvider(context: ComponentContext, provider: CapabilityProvider): void;
    registerContext(context: ComponentContext): void;
    getAllContexts(): ComponentContext[];
    getProvider(context: ComponentContext, capabilityName: string): CapabilityProvider | undefined;
    registerComponent(def: ComponentConfig): void;
    registerComponents(defs: ComponentConfig[]): void;
    getComponentDefinition(type: string): import("../types/spark-component.js").Spark.ComponentConfig | undefined;
    isComponentRegistered(type: string): boolean;
    getRegisteredComponentTypes(): string[];
    unregisterComponent(type: string): boolean;
    createComponentTree(cfg: ComponentConfig): import("../types/spark-component.js").Spark.ComponentConfig & {
        children?: import("../types/spark-component.js").Spark.ComponentConfig[] | undefined;
    };
    validateComponentConfig(cfg: ComponentConfig): boolean;
    getComponentCompatibility(): Record<string, string[]>;
    private generateId;
}
export declare const componentManager: SparkComponentManagerImpl;
/**
 * Create a new component manager instance with unified recursive rendering.
 * Optionally pass a custom renderer or registry implementation.
 */
export declare function createComponentManager(renderer?: SparkComponentRendererImpl, registry?: ComponentRegistry): ComponentManager;
//# sourceMappingURL=SparkComponentManager.d.ts.map