import type { SparkCapabilityProvider, SparkComponentContext } from '../types/spark-component';
/**
 * Create a proxy-like callable wrapper around a Set<SparkCapabilityProvider>.
 * Usages supported:
 * - providers['capabilityName'] => provider
 * - providers('capabilityName') => provider
 * - providers.add(provider) / providers.delete(provider) / providers.has(name)
 */
export declare function makeProvidersProxy(set: Set<SparkCapabilityProvider>): Set<SparkCapabilityProvider> & ((name?: string) => SparkCapabilityProvider | undefined);
/**
 * Providers proxy type for typing helpers
 */
export type Providers = Set<SparkCapabilityProvider> & ((name?: string) => unknown) & {
    impl: ((name?: string) => unknown) & Record<string, unknown>;
    provider: ((name?: string) => SparkCapabilityProvider | undefined) & Record<string, SparkCapabilityProvider | undefined>;
    raw: ((name?: string) => SparkCapabilityProvider | undefined) & Record<string, SparkCapabilityProvider | undefined>;
};
/**
 * Get typed implementation directly from a providers proxy.
 */
export declare function getProviderImplementation<T = unknown>(providers: Providers | undefined, name: string): T | undefined;
/**
 * Convenience helper: get implementation directly from context
 */
export declare function getProviderImplFromContext<T = unknown>(context: SparkComponentContext | undefined, name: string): T | undefined;
/**
 * Typed convenience: get ColumnConfig implementation from context
 */
export declare function getColumnConfig(context: SparkComponentContext | undefined): {
    addChildColumn?: (childConfig: unknown) => void;
} | undefined;
