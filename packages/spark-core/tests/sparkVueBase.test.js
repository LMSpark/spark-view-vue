import { describe, it, expect } from 'vitest';
import { createSparkVueComponent } from '../src/vue/SparkComponentBase.js';
import { Spark } from '../src/spark-namespace.js';
import { createComponentRegistry, createComponentManager } from '../src/factories.js';
describe('Spark Vue Base component (integration)', () => {
    it('component created with createSparkVueComponent registers and renders via manager.render', async () => {
        const registry = createComponentRegistry();
        const manager = createComponentManager(undefined, registry);
        const Comp = createSparkVueComponent({
            meta: { type: 'base-type', name: 'base', version: '1.0.0' },
            setup(_props, _ctx) {
                return () => null;
            }
        });
        // register via component meta helper
        const prevManager = Spark.manager;
        try {
            ;
            Spark.manager = () => manager;
            Spark.registerSparkComponentFromComponent(Comp);
        }
        finally {
            ;
            Spark.manager = prevManager;
        }
        // use manager.render to verify registry-driven render behavior (no .vue import in package tests)
        const instance = manager.render({ type: 'base-type', children: [] });
        expect(instance).toBeTruthy();
        expect(instance.component).toBe(Comp);
        expect(registry.has('base-type')).toBe(true);
    });
});
