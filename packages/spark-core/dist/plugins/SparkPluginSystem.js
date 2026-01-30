class SparkPluginManager {
    constructor() {
        this.plugins = new Map();
        this.hooks = {};
    }
    install(plugin) {
        var _a;
        if (this.plugins.has(plugin.name))
            this.uninstall(plugin.name);
        // Cast to ComponentManager for plugin authors; this manager is intentionally minimal in plugin context
        (_a = plugin.install) === null || _a === void 0 ? void 0 : _a.call(plugin, this);
        this.plugins.set(plugin.name, plugin);
        console.log(`✅ Installed SPARK plugin: ${plugin.name} (${plugin.version})`);
    }
    uninstall(name) {
        var _a;
        const p = this.plugins.get(name);
        if (!p)
            return false;
        (_a = p.uninstall) === null || _a === void 0 ? void 0 : _a.call(p, this);
        this.plugins.delete(name);
        console.log(`🗑️ Uninstalled SPARK plugin: ${name}`);
        return true;
    }
    get(name) { return this.plugins.get(name); }
    has(name) { return this.plugins.has(name); }
    getAll() { return Array.from(this.plugins.values()); }
    registerHook(hookName, hook) {
        const prev = this.hooks[hookName];
        if (prev) {
            const prevFn = prev;
            const hookFn = hook;
            this.hooks[hookName] = (...args) => { prevFn(...args); hookFn(...args); };
        }
        else
            this.hooks[hookName] = hook;
    }
    async executeHook(hookName, ...args) {
        const fn = this.hooks[hookName];
        if (!fn)
            return;
        try {
            await fn(...args);
        }
        catch (e) {
            console.error(`Plugin hook '${String(hookName)}' execution failed:`, String(e));
        }
    }
    clear() { Array.from(this.plugins.keys()).forEach(k => this.uninstall(k)); }
}
export class SparkDebugPlugin {
    constructor() {
        this.name = 'debug';
        this.version = '1.0.0';
        this.description = 'Component debugging and inspection plugin';
    }
    install(m) {
        m.registerHook('afterComponentCreate', (_cfg, ctx) => {
            console.log(`🐛 [DEBUG] Component created: ${ctx.type} (${ctx.id})`);
        });
    }
}
export class SparkPerformancePlugin {
    constructor() {
        this.name = 'performance';
        this.version = '1.0.0';
        this.description = 'Component performance monitoring plugin';
        this.metrics = new Map();
    }
    install(_m) {
        // minimal implementation
    }
    getMetrics(id) { return this.metrics.get(id); }
    getAllMetrics() { return new Map(this.metrics); }
}
export class SparkErrorHandlingPlugin {
    constructor() {
        this.name = 'error-handling';
        this.version = '1.0.0';
        this.description = 'Unified error handling for components';
        this.errorHandlers = [];
    }
    install(_m) {
        // register hooks as needed
    }
    addErrorHandler(h) { this.errorHandlers.push(h); }
    removeErrorHandler(h) { const i = this.errorHandlers.indexOf(h); if (i > -1)
        this.errorHandlers.splice(i, 1); }
}
export const globalPluginManager = new SparkPluginManager();
export function installSparkPlugin(p) { globalPluginManager.install(p); }
export function uninstallSparkPlugin(name) { return globalPluginManager.uninstall(name); }
export function getSparkPlugin(name) { return globalPluginManager.get(name); }
