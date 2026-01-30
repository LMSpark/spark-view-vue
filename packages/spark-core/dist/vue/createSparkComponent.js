import { createSparkVueComponent } from './SparkComponentBase.js';
/**
 * Unified factory for creating Spark-compatible Vue components.
 * This is the single recommended API to create components that expose spark meta and conform to Spark conventions.
 */
export function createSparkComponent(opts) {
    return createSparkVueComponent(opts);
}
