export * from './utils/SparkComponentRegistry.js';
export * from './utils/asyncUtils.js';
export * from './utils/errorHandler.js';
export * from './utils/configManager.js';
export * from './utils/logger.js';
export * from './utils/env.js';
export * from './utils/SparkCapabilitySystem.js';
export * from './utils/SparkComponentManager.js';
export * from './utils/sandbox.js';
export * from './composables/index.js';
export * from './composables/useSparkComponent.js';
export * from './utils/SparkComponentRenderer.js';
export * from './vue/createSparkComponent.js';
export * from './types/index.js';
export { Spark } from './spark-namespace.js';
// Primary unified API for creating Spark components
export { defineSparkComponent } from './vue/createSparkComponent.js';
// Factory functions for creating instances
export { createComponentRegistry } from './utils/SparkComponentRegistry.js';
export { createComponentManager } from './utils/SparkComponentManager.js';
// Implementation classes for testing/advanced usage
export { SparkComponentManagerImpl } from './utils/SparkComponentManager.js';
export { SparkComponentRendererImpl } from './utils/SparkComponentRenderer.js';
// DI keys for Vue injection
export { SPARK_MANAGER_KEY, SPARK_REGISTRY_KEY } from './types/spark-component.js';
// NOTE: prefer factories (createComponentManager/createComponentRegistry) for explicit instances; singletons are still available via existing exports.
