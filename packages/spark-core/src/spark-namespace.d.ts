import { componentManager } from './utils/SparkComponentManager.js';
import { capabilityManager } from './utils/SparkCapabilitySystem.js';
import { componentRegistry } from './utils/SparkComponentRegistry.js';
import { Logger as createLogger } from './utils/logger.js';
import { getSparkPlugin, installSparkPlugin } from './plugins/SparkPluginSystem.js';
import { createVueSparkPlugin } from './plugins/VueSparkPlugin.js';
import { useSparkComponent } from './composables/useSparkComponent.js';
import { createComponentRegistry } from './utils/SparkComponentRegistry.js';
import { createComponentManager } from './utils/SparkComponentManager.js';
import { defineSparkComponent } from './vue/createSparkComponent.js';
import { createSandbox, run, runAsync, render, renderAsync, validate } from './utils/sandbox.js';
import type { ComponentConfig, ComponentManager } from './types/spark-component.js';
export declare const Spark: {
    manager: () => typeof componentManager;
    capabilities: () => typeof capabilityManager;
    registry: () => typeof componentRegistry;
    register: (input: ComponentConfig | ComponentConfig[] | {
        spark?: Pick<ComponentConfig, 'type' | 'name' | 'version' | 'providers' | 'validator'>;
    }, manager?: ComponentManager) => void;
    registerSparkComponent: (input: ComponentConfig | ComponentConfig[] | {
        spark?: Pick<ComponentConfig, 'type' | 'name' | 'version' | 'providers' | 'validator'>;
    }, manager?: ComponentManager) => void;
    createComponentManager: typeof createComponentManager;
    createComponentRegistry: typeof createComponentRegistry;
    createVuePlugin: typeof createVueSparkPlugin;
    createLogger: typeof createLogger;
    sandbox: {
        create: typeof createSandbox;
        run: typeof run;
        runAsync: typeof runAsync;
        render: typeof render;
        renderAsync: typeof renderAsync;
        validate: typeof validate;
    };
    defineComponent: typeof defineSparkComponent;
    useComponent: typeof useSparkComponent;
    plugin: {
        install: typeof installSparkPlugin;
        get: typeof getSparkPlugin;
    };
    [key: string]: unknown;
};
export default Spark;
//# sourceMappingURL=spark-namespace.d.ts.map