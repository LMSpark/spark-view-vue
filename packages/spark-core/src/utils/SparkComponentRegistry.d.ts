import type { ComponentConfig, ComponentRegistry } from '../types/spark-component.js';
export declare class SparkComponentRegistryImpl implements ComponentRegistry {
    private components;
    private logger;
    register(type: string, definition: ComponentConfig): void;
    get(type: string): ComponentConfig | undefined;
    has(type: string): boolean;
    getAllTypes(): string[];
    getAllDefinitions(): ComponentConfig[];
    unregister(type: string): boolean;
    clear(): void;
    private validateDefinition;
    findCompatibleProviders(capabilityName: string, minVersion?: string): string[];
}
export declare const componentRegistry: SparkComponentRegistryImpl;
/**
 * Create a new, isolated component registry instance.
 * Prefer creating a dedicated registry when you want isolated test fixtures or alternative lifecycles.
 */
export declare function createComponentRegistry(): ComponentRegistry;
//# sourceMappingURL=SparkComponentRegistry.d.ts.map