import type { SparkComponentMeta } from './SparkComponentBase.js'
import { createSparkVueComponent } from './SparkComponentBase.js'

export type SparkComponent<_TConfig = unknown> = ReturnType<typeof createSparkVueComponent>

/**
 * Unified factory for creating Spark-compatible Vue components.
 * This is the single recommended API to create components that expose spark meta and conform to Spark conventions.
 */
export function createSparkComponent<_TConfig = unknown>(opts: { meta: SparkComponentMeta & { type: string }, setup?: (props: { config: _TConfig }, ctx?: unknown, helpers?: unknown) => unknown }) {
  return createSparkVueComponent(opts as any)
} 
