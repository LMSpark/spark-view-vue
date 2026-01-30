import type { SparkComponentMeta } from './SparkComponentBase.js'
import { createSparkVueComponent } from './SparkComponentBase.js'
import type { ComponentConfig } from '../types/spark-component.js'

export type SparkComponent<TConfig = ComponentConfig> = ReturnType<typeof createSparkVueComponent>

/**
 * Unified factory for creating Spark-compatible Vue components.
 * This is the single recommended API to create components that expose spark meta and conform to Spark conventions.
 */
export function createSparkComponent<TConfig extends ComponentConfig = ComponentConfig>(options: {
  meta: SparkComponentMeta & { type: string }
  setup?: (props: { config: TConfig }, ctx: any, helpers: any) => any
}): SparkComponent<TConfig> {
  if (!options?.meta?.type) {
    throw new Error('createSparkComponent requires meta with a type property')
  }

  return createSparkVueComponent(options as any)
} 
