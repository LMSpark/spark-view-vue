import type { ComponentConfig, CapabilityProvider } from '../types/spark-component.js'

export interface SparkComponentMeta {
  type: string
  name?: string
  version?: string
  providers?: CapabilityProvider[]
  validator?: (config: ComponentConfig) => boolean
}

export type SparkVueSetupHelpers = {
  provide: (name: string, implementation?: any) => void
  getProvider?: (name: string) => any
}

/**
 * @deprecated Use defineSparkComponent from createSparkComponent.ts instead
 * This file is kept for backward compatibility only.
 */
export function createSparkVueComponent(_options: {
  meta: SparkComponentMeta & { type: string }
  setup?: (props: any, ctx: any, helpers: SparkVueSetupHelpers) => any
}) {
  throw new Error('createSparkVueComponent is deprecated. Use defineSparkComponent from createSparkComponent.ts instead.')
}

export type SparkVueComponent = any
