import { reactive, computed, onMounted, onUnmounted, markRaw, inject } from 'vue';
import { Logger } from '../utils/logger.js';
import { capabilityManager } from '../utils/SparkCapabilitySystem.js';
import { SPARK_MANAGER_KEY, SPARK_REGISTRY_KEY } from '../types/spark-component.js';
// Local helper to create a noop provider when a capability is missing. This avoids any global registry side-effects.
function createNoopProvider(name) {
    return { name, version: '0.0.0', interface: {}, implementation: {} };
}
export function useSparkComponent(config, options) {
    var _a, _b;
    const parentContext = options === null || options === void 0 ? void 0 : options.parentContext;
    const ctxRaw = {
        id: config.id || `spark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: config.type,
        parent: parentContext,
        children: [],
        config: config,
        state: {},
        providers: new Set(),
        consumers: new Map()
    };
    const context = reactive(ctxRaw);
    const logger = Logger(context);
    // Resolve manager via explicit option or DI (Symbol-based); fail fast to enforce DI-first design
    const resolvedManager = (_b = (_a = options === null || options === void 0 ? void 0 : options.manager) !== null && _a !== void 0 ? _a : inject(SPARK_MANAGER_KEY)) !== null && _b !== void 0 ? _b : inject('sparkManager');
    if (!resolvedManager)
        throw new Error('Component manager not found. Provide via options.manager or install Spark Vue plugin with a manager (Spark.createVuePlugin({ manager })).');
    const manager = resolvedManager;
    const isVisible = computed(() => config.visible !== false);
    const isDisabled = computed(() => config.disabled === true);
    const initialize = () => logger.info(`🚀 Initializing SPARK component: ${context.type} (${context.id})`);
    const destroy = () => {
        logger.info(`🗑️ Destroying SPARK component: ${context.type} (${context.id})`);
        context.providers.clear();
        context.consumers.clear();
        try {
            manager && typeof manager.destroyContext === 'function' && manager.destroyContext(context.id);
        }
        catch (e) {
            logger.warn('Failed to destroy context via manager', String(e));
        }
    };
    function getProvider(name) {
        for (const p of Array.from(context.providers))
            if (p.name === name)
                return p;
        return undefined;
    }
    // Provide a capability on this context
    function provide(name, implementation) {
        const p = { name, version: '1.0.0', interface: {}, implementation };
        if (manager && typeof manager.registerProvider === 'function')
            manager.registerProvider(context, p);
        else
            context.providers.add(p);
        logger.info(`🔌 Provided capability: ${name} for ${context.type} (${context.id})`);
    }
    function consume(name) {
        var _a;
        const consumer = { capabilityName: name, interface: {}, implementation: undefined };
        context.consumers.set(name, consumer);
        const provider = manager.getProvider(context, name) || createNoopProvider(name);
        if (provider) {
            consumer.implementation = ((_a = provider.implementation) !== null && _a !== void 0 ? _a : provider);
            try {
                capabilityManager.connectCapability(provider, consumer, context);
            }
            catch (e) {
                logger.warn('autoConnectCapabilities failed', String(e));
            }
            logger.info(`🔌 Consumed capability: ${name} for ${context.type} (${context.id})`);
            return consumer.implementation;
        }
        logger.warn(`⚠️ Capability not found (registered consumer for late-binding): ${name} for ${context.type} (${context.id})`);
        return null;
    }
    function whenAvailable(name) {
        const p = getProvider(name);
        if (p)
            return Promise.resolve(p);
        return new Promise(resolve => {
            context.providerListeners = context.providerListeners || new Map();
            if (!context.providerListeners.has(name))
                context.providerListeners.set(name, new Set());
            const set = context.providerListeners.get(name);
            const cb = (prov) => { set.delete(cb); resolve(prov); };
            set.add(cb);
        });
    }
    onMounted(() => {
        initialize();
        const mgr = manager;
        if (!mgr)
            throw new Error('Component manager not found during mount. Ensure Spark plugin was installed or a manager passed via options.');
        mgr.registerContext(context);
        logger.info(`📝 Registered context to manager: ${context.id}`);
    });
    onUnmounted(() => {
        if (!manager) {
            logger.error('Component manager not found during unmount.');
            return;
        }
        try {
            manager.destroyContext(context.id);
            logger.info(`🗑️ Destroyed context via manager: ${context.id}`);
        }
        catch (e) {
            logger.error('Failed to destroy context via manager', String(e));
            destroy();
        }
    });
    // register default capability exposing the runtime context to consumers
    provide('sparkContext', context);
    return {
        context,
        isVisible,
        isDisabled,
        provide,
        getProvider,
        getInheritedProvider: (name, ctx) => {
            var _a;
            let t = ctx !== null && ctx !== void 0 ? ctx : context;
            while (t) {
                const p = Array.from(t.providers).find(pr => pr.name === name);
                if (p && p.implementation !== undefined)
                    return p.implementation;
                t = (_a = t.parent) !== null && _a !== void 0 ? _a : undefined;
            }
            return undefined;
        },
        consume,
        use: consume, // Alias for consume - more intuitive naming
        whenAvailable,
        initialize,
        destroy,
        logger,
        getComponent: (type) => {
            var _a, _b;
            // Prefer manager-backed registry
            try {
                const def = manager.getComponentDefinition(type);
                const comp = def === null || def === void 0 ? void 0 : def.component;
                return comp ? markRaw(comp) : undefined;
            }
            catch (_c) {
                // fallback to injected registry if present
                const registry = (_a = options === null || options === void 0 ? void 0 : options.registry) !== null && _a !== void 0 ? _a : inject(SPARK_REGISTRY_KEY);
                if (!registry)
                    return undefined;
                const comp = (_b = registry.get(type)) === null || _b === void 0 ? void 0 : _b.component;
                return comp ? markRaw(comp) : undefined;
            }
        },
        isComponentRegistered: (type) => {
            var _a;
            try {
                return manager.isComponentRegistered(type);
            }
            catch (_b) {
                const registry = (_a = options === null || options === void 0 ? void 0 : options.registry) !== null && _a !== void 0 ? _a : inject(SPARK_REGISTRY_KEY);
                return registry ? registry.has(type) : false;
            }
        },
        getOrCreateNoopProvider: (name) => createNoopProvider(name),
        connectCapability: (provider, consumer, ctx) => capabilityManager.connectCapability(provider, consumer, ctx),
        disconnectCapability: (provider, consumer, ctx) => capabilityManager.disconnectCapability(provider, consumer, ctx)
    };
}
