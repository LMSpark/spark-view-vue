import { Logger } from '../utils/logger.js';
import type { ComponentConfig, ComponentContext, CapabilityProvider, CapabilityConsumer, ComponentManager, ComponentRegistry } from '../types/spark-component.js';
import type { Implementation } from '../types/common.js';
export declare function useSparkComponent<TConfig extends ComponentConfig = ComponentConfig>(config: TConfig, options?: {
    manager?: ComponentManager;
    registry?: ComponentRegistry;
    parentContext?: ComponentContext;
}): {
    context: ComponentContext;
    isVisible: unknown;
    isDisabled: unknown;
    provide: (name: string, implementation?: Implementation) => void;
    getProvider: (name: string) => CapabilityProvider | undefined;
    getInheritedProvider: <T = unknown>(name: string, ctx?: ComponentContext) => T | undefined;
    consume: (name: string) => Implementation | null;
    use: (name: string) => Implementation | null;
    whenAvailable: (name: string) => Promise<CapabilityProvider>;
    initialize: () => void;
    destroy: () => void;
    logger: ReturnType<typeof Logger>;
    getComponent: (type: string) => unknown;
    isComponentRegistered: (type: string) => boolean;
    getOrCreateNoopProvider: (name: string) => CapabilityProvider;
    connectCapability: (provider: CapabilityProvider, consumer: CapabilityConsumer, ctx: ComponentContext) => void;
    disconnectCapability: (provider: CapabilityProvider, consumer: CapabilityConsumer, ctx: ComponentContext) => void;
};
//# sourceMappingURL=useSparkComponent.d.ts.map