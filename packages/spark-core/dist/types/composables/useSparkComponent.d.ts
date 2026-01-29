import type { SparkComponentConfig, SparkComponentContext, SparkCapabilityProvider, SparkCapabilityConsumer, SparkComponentDefinition } from '../types/spark-component';
export declare function useSparkComponent(props: {
    config: SparkComponentConfig;
    parentContext?: SparkComponentContext | undefined;
}): {
    context: SparkComponentContext;
    isVisible: import('vue').ComputedRef<boolean>;
    isDisabled: import('vue').ComputedRef<boolean>;
    componentClass: import('vue').ComputedRef<string[]>;
    componentStyle: import('vue').ComputedRef<any>;
    registerProvider: (name: string, implementation: unknown) => void;
    getProvider: (name: string) => SparkCapabilityProvider | undefined;
    getInheritedCapability: (name: string) => unknown;
    consumeCapability: (name: string) => unknown;
    whenProviderAvailable: (name: string) => Promise<SparkCapabilityProvider>;
    GetProvider: <T = unknown>(name: string, ctx?: SparkComponentContext) => T | undefined;
    initialize: () => void;
    destroy: () => void;
    logger: {
        debug: (...args: unknown[]) => void;
        info: (...args: unknown[]) => void;
        warn: (...args: unknown[]) => void;
        error: (...args: unknown[]) => void;
    };
    getSparkComponent: (type: string) => SparkComponentDefinition | undefined;
    isComponentRegistered: (type: string) => boolean;
    getOrCreateNoopProvider: (name: string) => SparkCapabilityProvider;
    registerGlobalProvider: (name: string, provider: SparkCapabilityProvider) => void;
    getGlobalProvider: (name: string) => SparkCapabilityProvider | undefined;
    connectCapability: (provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer, context: SparkComponentContext) => boolean;
    disconnectCapability: (provider: SparkCapabilityProvider, consumer: SparkCapabilityConsumer, context: SparkComponentContext) => boolean;
};
