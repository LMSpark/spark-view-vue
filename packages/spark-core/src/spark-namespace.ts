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
import type { App } from 'vue'
import type { ComponentDefinition, ComponentConfig, ComponentContext, Plugin, ComponentManager, ComponentRegistry, CapabilityProvider } from './types/spark-component.js'
import type { SparkComponentMeta } from './vue/SparkComponentBase.js' 

export const Spark = {
  // manager getter used across tests and app entry
  manager: (): typeof componentManager => componentManager,
  // capability manager getter
  capabilities: (): typeof capabilityManager => capabilityManager,
  // registry accessor
  registry: (): typeof componentRegistry => componentRegistry,
  // registry helpers - delegate to manager
  registerSparkComponent: (definition: ComponentDefinition) => {
    if (!definition || typeof definition !== 'object') {
      throw new Error('registerSparkComponent requires a ComponentDefinition object')
    }
    if (typeof definition.type !== 'string' || definition.type.trim() === '') {
      throw new Error('ComponentDefinition must have a non-empty type string')
    }
    return componentManager.registerComponent(definition)
  },
  registerSparkComponents: (definitions: ComponentDefinition[]) => {
    if (!Array.isArray(definitions)) {
      throw new Error('registerSparkComponents expects an array of ComponentDefinition objects')
    }
    definitions.forEach(def => {
      if (!def || typeof def !== 'object') {
        throw new Error('Each definition must be a ComponentDefinition object')
      }
      if (typeof def.type !== 'string' || def.type.trim() === '') {
        throw new Error('Each ComponentDefinition must have a non-empty type string')
      }
    })
    return definitions.forEach(def => componentManager.registerComponent(def))
  },
  // Register a component by inspecting its attached spark meta. Minimal requirement: component.spark.type
  registerSparkComponentFromComponent: (component: { spark?: SparkComponentMeta }) => {
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

    const definition: ComponentDefinition = {
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
  // factories for creating instances
  createComponentRegistry,
  createComponentManager,
  // unified rendering API
  render: (config: ComponentConfig) => componentManager.render(config),
  renderTree: (config: ComponentConfig) => componentManager.render(config),
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
