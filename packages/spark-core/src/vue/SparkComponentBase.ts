import { defineComponent, h } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useSparkComponent } from '../composables/useSparkComponent.js'
import type { CapabilityProvider } from '../types/common.js'

export interface SparkComponentMeta {
  type: string
  name?: string
  version?: string
  providers?: CapabilityProvider[]
  validator?: (cfg: any) => boolean
}

import type { Implementation } from '../types/common.js'

export type SparkVueSetupHelpers = {
  provide: (name: string, impl?: Implementation) => void
  getProvider?: (name: string) => unknown
}

/**
 * Create a minimal Spark-compatible Vue component.
 * - Attaches `spark` meta to the component
 * - Exposes props: `{ config }` (Spark ComponentConfig)
 * - Calls `useComponent(config)` inside setup and passes helpers to user setup
 */
export function createSparkVueComponent(opts: {
  meta: SparkComponentMeta & { type: string }
  setup?: (props: any, ctx: any, helpers: SparkVueSetupHelpers) => any
}) {
  const comp = defineComponent({
    name: opts.meta.name || opts.meta.type,
    props: {
      config: { type: Object as any, required: true }
    },
    setup(props: any, ctx: any) {
      const { provide, getProvider } = useSparkComponent(props.config)
      const helpers: SparkVueSetupHelpers = { provide, getProvider }
      if (typeof opts.setup === 'function') return opts.setup(props, ctx, helpers)
      // default render when no setup provided
      return () => h('div', { class: 'spark-component-default' }, [`${opts.meta.type}`])
    }
  })

  // attach meta directly and return component
  ;(comp as any).spark = opts.meta
  return comp as any
}

export type SparkVueComponent = ReturnType<typeof createSparkVueComponent> | ComponentPublicInstance
