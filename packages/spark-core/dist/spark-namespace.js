// Package-level SPARK namespace to simplify application imports
// Import runtime entry points from source implementations to avoid built dist dependency
import { componentManager } from './utils/SparkComponentManager.js';
import { capabilityManager } from './utils/SparkCapabilitySystem.js';
import { componentRegistry } from './utils/SparkComponentRegistry.js';
import { Logger as createLogger } from './utils/logger.js';
import { getSparkPlugin, installSparkPlugin } from './plugins/SparkPluginSystem.js';
import { createVueSparkPlugin } from './plugins/VueSparkPlugin.js';
import { useSparkComponent } from './composables/useSparkComponent.js';
import { createComponentRegistry } from './utils/SparkComponentRegistry.js';
import { createComponentManager } from './utils/SparkComponentManager.js';
export const Spark = {
    // manager getter used across tests and app entry
    manager: () => componentManager,
    // capability manager getter
    capabilities: () => capabilityManager,
    // registry accessor
    registry: () => componentRegistry,
    // registry helpers - delegate to manager
    registerSparkComponent: (def) => {
        if (typeof def === 'string')
            throw new Error('registerSparkComponent signature changed: pass a ComponentDefinition object');
        return componentManager.registerComponent(def);
    },
    registerSparkComponents: (defs) => {
        if (!Array.isArray(defs))
            throw new Error('registerSparkComponents expects an array of component definitions');
        return defs.forEach((d) => componentManager.registerComponent(d));
    },
    // Register a component by inspecting its attached spark meta. Minimal requirement: component.spark.type
    registerSparkComponentFromComponent: (component) => {
        if (!component)
            throw new Error('component is required');
        const comp = component;
        const meta = comp.spark;
        if (!meta || typeof meta.type !== 'string' || meta.type.trim() === '')
            throw new Error('component must expose spark meta with a non-empty "type" property');
        const def = { type: meta.type, name: meta.name || meta.type, version: meta.version || '0.0.0', component, providers: meta.providers, validator: meta.validator };
        // Use the current Spark.manager() to allow test-time override of the manager in test fixtures
        const mgr = Spark.manager ? Spark.manager() : componentManager;
        return mgr.registerComponent(def);
    },
    getSparkComponent: (type) => { var _a; return (_a = componentRegistry.get(type)) === null || _a === void 0 ? void 0 : _a.component; },
    // logger (single unified API)
    Logger: createLogger,
    // plugins
    installSparkPlugin: (plugin) => installSparkPlugin(plugin),
    getSparkPlugin: (name) => getSparkPlugin(name),
    // composables / helpers
    useComponent: (config, parent) => useSparkComponent(config, { parentContext: parent }),
    useSparkComponent: (config, opts) => useSparkComponent(config, opts),
    // factories for creating instances
    createComponentRegistry,
    createComponentManager,
    // initialization hook (no-op by default; features may extend this with `initializeApp`)
    initialize: async () => { return Promise.resolve(); },
    // Vue plugin helpers
    // Use `Spark.createVuePlugin({ manager })` to get a plugin, or call `Spark.install(app, { manager })` to install directly.
    createVuePlugin: (opts) => createVueSparkPlugin(opts),
    install(app, opts) {
        if (!opts || !opts.manager)
            throw new Error('Spark.install(app, { manager }) requires an explicit manager. Create one via createComponentManager(registry) and pass it here.');
        const plugin = createVueSparkPlugin({ manager: opts.manager, registry: opts.registry });
        app.use(plugin);
    }
};
export default Spark;
