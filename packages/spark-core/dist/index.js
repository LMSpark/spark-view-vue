export * from './utils/SparkComponentRegistry.js';
export * from './utils/asyncUtils.js';
export * from './utils/errorHandler.js';
export * from './utils/configManager.js';
export * from './utils/logger.js';
export * from './utils/SparkCapabilitySystem.js';
export * from './utils/SparkComponentManager.js';
export * from './composables/index.js';
export * from './composables/useSparkComponent.js';
export * from './utils/SparkComponentRenderer.js';
export * from './vue/SparkComponentBase.js';
export * from './vue/createSparkComponent.js';
export * from './types/index.js';
export { Spark } from './spark-namespace.js';
// NOTE: prefer factories (createComponentManager/createComponentRegistry) for explicit instances; singletons are still available via existing exports.
