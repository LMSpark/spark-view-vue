// Minimal renderer helper used in tests
export class SparkComponentRendererImpl {
    shouldUpdateComponent(oldCfg, newCfg) {
        if (oldCfg === newCfg)
            return false;
        if (!oldCfg || !newCfg)
            return true;
        if (oldCfg.type !== newCfg.type)
            return true;
        // shallow props comparison
        const oldProps = oldCfg['props'] || {};
        const newProps = newCfg['props'] || {};
        if (Object.keys(oldProps).length !== Object.keys(newProps).length)
            return true;
        for (const k of Object.keys(oldProps))
            if (oldProps[k] !== newProps[k])
                return true;
        return false;
    }
    haveChildrenChanged(oldChildren, newChildren) {
        if (oldChildren.length !== newChildren.length)
            return true;
        for (let i = 0; i < oldChildren.length; i++) {
            const a = oldChildren[i];
            const b = newChildren[i];
            if (a.type !== b.type)
                return true;
            const pa = a['props'] || {};
            const pb = b['props'] || {};
            if (Object.keys(pa).length !== Object.keys(pb).length)
                return true;
            for (const k of Object.keys(pa))
                if (pa[k] !== pb[k])
                    return true;
        }
        return false;
    }
    /**
     * Resolve a renderer implementation for the given config using the provided resolver.
     * Returns the resolved renderer or null when no renderer is available.
     */
    static resolveRendererForConfig(cfg, resolver) {
        var _a;
        if (!cfg || !cfg.type)
            return null;
        return (_a = resolver(cfg.type)) !== null && _a !== void 0 ? _a : null;
    }
    /**
     * Create a resolver function that queries a ComponentRegistry instance.
     */
    static createResolverFromRegistry(registry) {
        return (type) => {
            var _a;
            const def = registry.get(type);
            return (_a = def === null || def === void 0 ? void 0 : def.component) !== null && _a !== void 0 ? _a : null;
        };
    }
    /**
     * Check whether a type is registered in the registry.
     */
    static isTypeRegistered(registry, type) {
        return registry.has(type);
    }
    /**
     * Return the children array for a config (empty array when none).
     */
    static getChildrenForConfig(cfg) {
        return Array.isArray(cfg.children) ? cfg.children : [];
    }
}
