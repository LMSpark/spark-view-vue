/**
 * Resolve a renderer implementation for the given config using the provided resolver.
 * Returns the resolved renderer or null when no renderer is available.
 */
export function resolveRendererForConfig(cfg, resolver) {
    var _a;
    if (!cfg || !cfg.type)
        return null;
    return (_a = resolver(cfg.type)) !== null && _a !== void 0 ? _a : null;
}
/**
 * Create a resolver function that queries a ComponentRegistry instance.
 */
export function createResolverFromRegistry(registry) {
    return (type) => {
        var _a;
        const def = registry.get(type);
        return (_a = def === null || def === void 0 ? void 0 : def.component) !== null && _a !== void 0 ? _a : null;
    };
}
/**
 * Check whether a type is registered in the registry.
 */
export function isTypeRegistered(registry, type) {
    return registry.has(type);
}
/**
 * Return the children array for a config (empty array when none).
 */
export function getChildrenForConfig(cfg) {
    return Array.isArray(cfg.children) ? cfg.children : [];
}
