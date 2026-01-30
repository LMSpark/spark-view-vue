import { componentRegistry as defaultRegistry } from './SparkComponentRegistry.js';
import { Logger } from './logger.js';
import { capabilityManager } from './SparkCapabilitySystem.js';
export class SparkComponentManagerImpl {
    constructor(renderer, registry) {
        this.contexts = new Map();
        this.logger = Logger();
        this.renderer = renderer;
        this.registry = registry || defaultRegistry;
    }
    createContext(config, parent) {
        const ctx = {
            id: config.id || this.generateId(),
            type: config.type,
            parent,
            children: [],
            config,
            state: {},
            providers: new Set(),
            consumers: new Map()
        };
        if (parent)
            parent.children.push(ctx);
        this.contexts.set(ctx.id, ctx);
        return ctx;
    }
    render(config, parentContext) {
        const ctx = this.createContext(config, parentContext);
        // For now renderer delegates to component registry to build an instance placeholder
        const def = this.registry.get(config.type);
        if (!def)
            throw new Error(`Component type '${config.type}' is not registered`);
        const instance = { type: 'vue-component', component: def.component, props: { config, context: ctx } };
        this.logger.info(`Rendered component: ${config.type} (${ctx.id})`);
        return instance;
    }
    getContext(id) {
        return this.contexts.get(id);
    }
    destroyContext(id) {
        const ctx = this.contexts.get(id);
        if (!ctx)
            return false;
        try {
            capabilityManager.disconnectAllCapabilities(ctx);
            if (ctx.parent)
                ctx.parent.children = ctx.parent.children.filter(c => c.id !== id);
            const walk = (c) => {
                c.children.forEach(x => walk(x));
                this.contexts.delete(c.id);
            };
            walk(ctx);
            this.contexts.delete(id);
            return true;
        }
        catch (e) {
            this.logger.error('Failed to destroy context:', e);
            return false;
        }
    }
    registerProvider(context, provider) {
        context.providers.add(provider);
        try {
            capabilityManager.autoConnectCapabilities(context);
        }
        catch (_a) { }
        // notify any listeners waiting for a provider
        if (context.providerListeners && context.providerListeners.has(provider.name)) {
            const set = context.providerListeners.get(provider.name);
            set.forEach(cb => {
                try {
                    cb(provider);
                }
                catch (e) {
                    this.logger.warn('provider listener threw', String(e));
                }
            });
            set.clear();
        }
    }
    registerContext(context) {
        if (!this.contexts.has(context.id))
            this.contexts.set(context.id, context);
    }
    getAllContexts() {
        return Array.from(this.contexts.values());
    }
    getProvider(context, capabilityName) {
        const provider = Array.from(context.providers).find(p => p.name === capabilityName);
        if (provider)
            return provider;
        if (context.parent)
            return this.getProvider(context.parent, capabilityName);
        return undefined;
    }
    registerComponent(def) {
        this.registry.register(def.type, def);
    }
    registerComponents(defs) {
        defs.forEach(d => this.registerComponent(d));
    }
    getComponentDefinition(type) {
        return this.registry.get(type);
    }
    isComponentRegistered(type) {
        return this.registry.has(type);
    }
    getRegisteredComponentTypes() {
        return this.registry.getAllTypes();
    }
    unregisterComponent(type) {
        return this.registry.unregister(type);
    }
    createComponentTree(cfg) {
        const copy = Object.assign({}, cfg);
        if (copy.children)
            copy.children = copy.children.map((c) => this.createComponentTree(c));
        return copy;
    }
    validateComponentConfig(cfg) {
        const def = this.registry.get(cfg.type);
        if (!def)
            return false;
        if (def.validator)
            return def.validator(cfg);
        return true;
    }
    getComponentCompatibility() {
        const map = {};
        this.registry.getAllDefinitions().forEach(def => {
            if (def.consumers) {
                def.consumers.forEach(cons => {
                    const arr = map[cons.capabilityName] = map[cons.capabilityName] || [];
                    let providers = [];
                    if (typeof this.registry.findCompatibleProviders === 'function')
                        providers = this.registry.findCompatibleProviders(cons.capabilityName, cons.minVersion);
                    arr.push(...providers);
                });
            }
        });
        Object.keys(map).forEach(k => map[k] = Array.from(new Set(map[k])));
        return map;
    }
    generateId() {
        return `spark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
export const componentManager = new SparkComponentManagerImpl();
/**
 * Create a new component manager instance. Optionally pass a renderer (e.g., test renderer) implementation.
 */
export function createComponentManager(renderer, registry) {
    return new SparkComponentManagerImpl(renderer, registry);
}
// NOTE: convenience helpers were removed to avoid duplicating the public namespace API.
// Use `Spark.manager()` or `componentManager` directly.
