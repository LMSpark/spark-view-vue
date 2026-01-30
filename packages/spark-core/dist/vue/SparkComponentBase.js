import { defineComponent, h } from 'vue';
import { useSparkComponent } from '../composables/useSparkComponent.js';
/**
 * Create a minimal Spark-compatible Vue component.
 * - Attaches `spark` meta to the component
 * - Exposes props: `{ config }` (Spark ComponentConfig)
 * - Calls `useComponent(config)` inside setup and passes helpers to user setup
 */
export function createSparkVueComponent(opts) {
    const comp = defineComponent({
        name: opts.meta.name || opts.meta.type,
        props: {
            config: { type: Object, required: true }
        },
        setup(props, ctx) {
            const { provide, getProvider } = useSparkComponent(props.config);
            const helpers = { provide, getProvider };
            if (typeof opts.setup === 'function')
                return opts.setup(props, ctx, helpers);
            // default render when no setup provided
            return () => h('div', { class: 'spark-component-default' }, [`${opts.meta.type}`]);
        }
    });
    comp.spark = opts.meta;
    return comp;
}
