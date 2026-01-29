import type { SparkCapabilityProvider } from '../types/spark-component';
export declare function registerGlobalProvider(name: string, provider: SparkCapabilityProvider): void;
export declare function getGlobalProvider(name: string): SparkCapabilityProvider | undefined;
/**
 * 返回一个 no-op provider，用于避免 consumer 出现 null 错误（可选）
 */
export declare function getOrCreateNoopProvider(name: string, interfaceSpec?: Record<string, unknown>): SparkCapabilityProvider;
