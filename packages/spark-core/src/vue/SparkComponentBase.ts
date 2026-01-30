import { defineComponent, h } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useSparkComponent } from '../composables/useSparkComponent.js'
import type { CapabilityProvider } from '../types/common.js'
import type { ComponentConfig } from '../types/spark-component.js'

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
 * Create a minimal Spark-compatible Vue component.
 * - Attaches `spark` meta to the component for automatic registration
 * - Exposes props: `{ config }` (Spark ComponentConfig)
 * - Calls `useComponent(config)` inside setup and passes helpers to user setup
 */
export function createSparkVueComponent<TConfig extends ComponentConfig = ComponentConfig>(options: {
  meta: SparkComponentMeta & { type: string }
  setup?: (props: { config: TConfig }, ctx: any, helpers: SparkVueSetupHelpers) => any
}) {
  const component = defineComponent({
    name: options.meta.name || options.meta.type,
    props: {
      config: {
        type: Object as any,
        required: true,
        validator: (value: any) => {
          if (!value || typeof value !== 'object') return false
          if (!value.type || typeof value.type !== 'string') return false
          return !options.meta.validator || options.meta.validator(value)
        }
      }
    },
    setup(props: { config: TConfig }, ctx: any) {
      const { provide, getProvider } = useSparkComponent(props.config)
      const helpers: SparkVueSetupHelpers = { provide, getProvider }

      if (typeof options.setup === 'function') {
        return options.setup(props, ctx, helpers)
      }

      // Default render when no setup provided
      return () => h('div', {
        class: 'spark-component-default',
        'data-spark-type': options.meta.type
      }, [`${options.meta.type}`])
    }
  })

  // Attach meta directly for automatic registration
  ;(component as any).spark = options.meta
  return component as any
}

export type SparkVueComponent<TConfig extends ComponentConfig = ComponentConfig> = ReturnType<typeof createSparkVueComponent<TConfig>> | ComponentPublicInstance
