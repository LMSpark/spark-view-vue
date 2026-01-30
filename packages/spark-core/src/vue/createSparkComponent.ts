import type { SparkComponentMeta } from './SparkComponentBase.js'
import { createSparkVueComponent } from './SparkComponentBase.js'

export type SparkComponent<_TConfig = any> = ReturnType<typeof createSparkVueComponent>

/**
 * Unified factory for creating Spark-compatible Vue components.
 * This is the single recommended API to create components that expose spark meta and conform to Spark conventions.
 */
export function createSparkComponent<_TConfig = any>(opts: { meta: SparkComponentMeta & { type: string }, setup?: (props: { config: _TConfig }, ctx: any, helpers: any) => any }) {
  return createSparkVueComponent(opts as any)
} 
