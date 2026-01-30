import { describe, it, expect } from 'vitest';
import { resolveRendererForConfig, getChildrenForConfig, createResolverFromRegistry, isTypeRegistered } from '../src/utils/renderLogic.js';
import { SparkComponentRegistryImpl } from '../src/utils/SparkComponentRegistry.js';
const mockResolver = (type) => {
    if (type === 'known')
        return { name: 'Known' };
    return null;
};
describe('renderLogic', () => {
    it('resolves renderer when resolver returns implementation', () => {
        const cfg = { type: 'known' };
        const r = resolveRendererForConfig(cfg, mockResolver);
        expect(r).toEqual({ name: 'Known' });
    });
    it('returns null when resolver returns null', () => {
        const cfg = { type: 'unknown' };
        const r = resolveRendererForConfig(cfg, mockResolver);
        expect(r).toBeNull();
    });
    it('returns children or empty array', () => {
        const c1 = { type: 'a' };
        const c2 = { type: 'b' };
        expect(getChildrenForConfig({ type: 'x' })).toEqual([]);
        expect(getChildrenForConfig({ type: 'x', children: [c1, c2] })).toEqual([c1, c2]);
    });
    it('can resolve using a registry resolver and detect registration', () => {
        const reg = new SparkComponentRegistryImpl();
        reg.register('my-type', { type: 'my-type', name: 'My', version: '1.0.0', component: { name: 'MyComp' } });
        const resolver = createResolverFromRegistry(reg);
        expect(isTypeRegistered(reg, 'my-type')).toBe(true);
        expect(resolveRendererForConfig({ type: 'my-type' }, resolver)).toEqual({ name: 'MyComp' });
        expect(isTypeRegistered(reg, 'unknown')).toBe(false);
    });
});
