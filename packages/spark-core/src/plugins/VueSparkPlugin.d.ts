import type { App } from 'vue';
import type { ComponentManager, ComponentRegistry } from '../types/spark-component.js';
export interface VueSparkPluginOptions {
    manager: ComponentManager;
    registry?: ComponentRegistry;
}
export declare function createVueSparkPlugin(options: VueSparkPluginOptions): {
    name: string;
    install(app: App): void;
};
//# sourceMappingURL=VueSparkPlugin.d.ts.map