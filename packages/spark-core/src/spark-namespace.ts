// Package-level SPARK namespace to simplify application imports
// Import runtime entry points from source implementations to avoid built dist dependency
import { componentManager } from './utils/SparkComponentManager.js'
import { capabilityManager } from './utils/SparkCapabilitySystem.js'
import { componentRegistry } from './utils/SparkComponentRegistry.js'

import { Logger as createLogger } from './utils/logger.js'
import { getSparkPlugin, installSparkPlugin } from './plugins/SparkPluginSystem.js'
import { createVueSparkPlugin } from './plugins/VueSparkPlugin.js'
import { useSparkComponent } from './composables/useSparkComponent.js'
import { createComponentRegistry } from './utils/SparkComponentRegistry.js'
import { createComponentManager } from './utils/SparkComponentManager.js'
import { defineSparkComponent } from './vue/createSparkComponent.js'
import type { App } from 'vue'
import type { ComponentConfig, ComponentContext, Plugin, ComponentManager, ComponentRegistry } from './types/spark-component.js' 

export const Spark = {
  // manager getter used across tests and app entry
  manager: (): typeof componentManager => componentManager,
  // capability manager getter
  capabilities: (): typeof capabilityManager => capabilityManager,
  // registry accessor
  registry: (): typeof componentRegistry => componentRegistry,
  // unified registration API - handles multiple input types intelligently
  register: (input: ComponentConfig | ComponentConfig[] | { spark?: Pick<ComponentConfig, 'type' | 'name' | 'version' | 'providers' | 'validator'> }) => {
    // Handle array of components
    if (Array.isArray(input)) {
      if (!Array.isArray(input)) {
        throw new Error('register expects an array of ComponentConfig objects')
      }
      input.forEach(def => {
        if (!def || typeof def !== 'object') {
          throw new Error('Each definition must be a ComponentConfig object')
        }
        if (typeof def.type !== 'string' || def.type.trim() === '') {
          throw new Error('Each ComponentConfig must have a non-empty type string')
        }
      })
      return input.forEach(def => componentManager.registerComponent(def))
    }

    // Handle Vue component with spark meta
    if (input && typeof input === 'object' && 'spark' in input) {
      const component = input as { spark?: Pick<ComponentConfig, 'type' | 'name' | 'version' | 'providers' | 'validator'> }
      if (!component) {
        throw new Error('Component is required')
      }
      const meta = component.spark
      if (!meta) {
        throw new Error('Component must have spark meta attached')
      }
      if (!meta.type || typeof meta.type !== 'string' || meta.type.trim() === '') {
        throw new Error('Component spark meta must have a non-empty type property')
      }

      const definition: ComponentConfig = {
        type: meta.type,
        name: meta.name || meta.type,
        version: meta.version || '0.0.0',
        component,
        providers: meta.providers,
        validator: meta.validator
      }

      // Use the current Spark.manager() to allow test-time override of the manager in test fixtures
      const manager = Spark.manager()
      return manager.registerComponent(definition)
    }

    // Handle single ComponentConfig
    if (input && typeof input === 'object' && 'type' in input) {
      const definition = input as ComponentConfig
      if (!definition || typeof definition !== 'object') {
        throw new Error('register requires a ComponentConfig object')
      }
      if (typeof definition.type !== 'string' || definition.type.trim() === '') {
        throw new Error('ComponentConfig must have a non-empty type string')
      }
      return componentManager.registerComponent(definition)
    }

    throw new Error('Invalid input for Spark.register(). Expected ComponentConfig, ComponentConfig[], or Vue component with spark meta.')
  },

  // Register logical component from config (creates a component that can render children)
  registerLogical: (config: ComponentConfig) => {
    if (!config) {
      throw new Error('ComponentConfig is required')
    }
    if (!config.type || typeof config.type !== 'string' || config.type.trim() === '') {
      throw new Error('ComponentConfig must have a non-empty type property')
    }

    // Create a logical component definition that can render children recursively
    const definition: ComponentConfig = {
      type: config.type,
      name: config.name || config.type,
      version: config.version || '1.0.0',
      component: null, // Logical component - no actual Vue component
      validator: (cfg: ComponentConfig) => cfg.type === config.type // Basic type validation
    }

    // Use the current Spark.manager() to allow test-time override of the manager in test fixtures
    const manager = Spark.manager()
    return manager.registerComponent(definition)
  },
  getSparkComponent: (type: string) => componentRegistry.get(type)?.component,

  // logger (single unified API)
  Logger: createLogger,
  // plugins
  installSparkPlugin: (plugin: Plugin) => installSparkPlugin(plugin),
  getSparkPlugin: (name: string) => getSparkPlugin(name),
  // composables / helpers
  useComponent: (config: ComponentConfig, parent?: ComponentContext) => useSparkComponent(config, { parentContext: parent }),
  useSparkComponent: (config: ComponentConfig, opts?: { manager?: any, registry?: any, parentContext?: ComponentContext }) => useSparkComponent(config, opts),
  // unified component creation API
  defineComponent: defineSparkComponent,
  // factories for creating instances
  createComponentRegistry,
  createComponentManager,
  // unified rendering API
  render: (config: ComponentConfig) => componentManager.render(config),
  // initialization hook (no-op by default; features may extend this with `initializeApp`)
  initialize: async () => { return Promise.resolve() },
  // Vue plugin helpers
  // Use `Spark.createVuePlugin({ manager })` to get a plugin, or call `Spark.install(app, { manager })` to install directly.
  createVuePlugin: (opts: { manager: ComponentManager, registry?: ComponentRegistry }) => createVueSparkPlugin(opts),
  install(app: App, opts?: { manager?: ComponentManager, registry?: ComponentRegistry }) {
    if (!opts || !opts.manager) throw new Error('Spark.install(app, { manager }) requires an explicit manager. Create one via createComponentManager(registry) and pass it here.')
    const plugin = createVueSparkPlugin({ manager: opts.manager, registry: opts.registry })
    app.use(plugin as any)
  }
}

export default Spark
