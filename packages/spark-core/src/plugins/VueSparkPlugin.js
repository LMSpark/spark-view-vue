import { SPARK_MANAGER_KEY, SPARK_REGISTRY_KEY } from '../types/spark-component.js';
export function createVueSparkPlugin(options) {
    if (!options?.manager)
        throw new Error('VueSparkPlugin requires { manager } option. Provide a manager created by createComponentManager(registry)');
    const { manager, registry } = options;
    return {
        name: 'spark-vue-plugin',
        install(app) {
            // Provide strict DI into Vue app using Symbols (no magic strings)
            app.provide(SPARK_MANAGER_KEY, manager);
            if (registry)
                app.provide(SPARK_REGISTRY_KEY, registry);
        }
    };
}
