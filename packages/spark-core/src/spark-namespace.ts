// Package-level SPARK namespace to simplify application imports
// Import runtime entry points from source implementations to avoid built dist dependency
import { componentManager } from './utils/SparkComponentManager.js'
import { capabilityManager } from './utils/SparkCapabilitySystem.js'
import { componentRegistry } from './utils/SparkComponentRegistry.js'

import { Logger as createLogger } from './utils/logger.js'
import { getSparkPlugin, installSparkPlugin } from './plugins/SparkPluginSystem.js'
import { createVueSparkPlugin } from './plugins/VueSparkPlugin.js'
import { useSparkComponent } from './composables/useSparkComponent.js'
import type { App } from 'vue'
import type { ComponentDefinition, ComponentConfig, ComponentContext, Plugin, ComponentManager, ComponentRegistry } from './types/spark-component.js' 

export const Spark = {
  // manager getter used across tests and app entry
  manager: (): typeof componentManager => componentManager,
  // capability manager getter
  capabilities: (): typeof capabilityManager => capabilityManager,
  // registry accessor
  registry: (): typeof componentRegistry => componentRegistry,
  // registry helpers - delegate to manager
  registerSparkComponent: (def: ComponentDefinition) => {
    if (typeof def === 'string') throw new Error('registerSparkComponent signature changed: pass a ComponentDefinition object')
    return componentManager.registerComponent(def)
  },
  registerSparkComponents: (defs: ComponentDefinition[]) => {
    if (!Array.isArray(defs)) throw new Error('registerSparkComponents expects an array of component definitions')
    return defs.forEach((d: ComponentDefinition) => componentManager.registerComponent(d))
  },
  // Register a component by inspecting its attached spark meta. Minimal requirement: component.spark.type
  registerSparkComponentFromComponent: (component: any) => {
    if (!component) throw new Error('component is required')
    const meta = (component as any).spark
    if (!meta || typeof meta.type !== 'string' || meta.type.trim() === '') throw new Error('component must expose spark meta with a non-empty "type" property')
    const def: ComponentDefinition = { type: meta.type, name: meta.name || meta.type, version: meta.version || '0.0.0', component, providers: meta.providers, validator: meta.validator }
    // Use the current Spark.manager() to allow test-time override of the manager in test fixtures
    const mgr = (Spark as any).manager ? (Spark as any).manager() : componentManager
    return (mgr as ComponentManager).registerComponent(def)
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
