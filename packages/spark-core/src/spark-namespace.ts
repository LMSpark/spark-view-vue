// Package-level SPARK namespace to simplify application imports
// Import runtime entry points from source implementations to avoid built dist dependency
import { componentManager } from './utils/SparkComponentManager.js'
import { capabilityManager } from './utils/SparkCapabilitySystem.js'
import { componentRegistry } from './utils/SparkComponentRegistry.js'
import { registerGlobalProvider, getGlobalProvider, getOrCreateNoopProvider } from './utils/GlobalProviderRegistry.js'
import { Logger as createLogger } from './utils/logger.js'
import { getSparkPlugin, installSparkPlugin } from './plugins/SparkPluginSystem.js'
import { useComponent } from './composables/useSparkComponent.js'
import type { App } from 'vue'
import type { ComponentDefinition, CapabilityProvider, ComponentConfig, ComponentContext, Plugin } from './types/spark-component.js'
import type { CapabilityInterface } from './types/common.js'

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
  getSparkComponent: (type: string) => componentRegistry.get(type)?.component,
  // global providers
  registerGlobalProvider: (name: string, provider: CapabilityProvider) => registerGlobalProvider(name, provider),
  getGlobalProvider: (name: string) => getGlobalProvider(name),
  getOrCreateNoopProvider: (name: string, iface?: CapabilityInterface) => getOrCreateNoopProvider(name, iface),
  // logger (single unified API)
  Logger: createLogger,
  // plugins
  installSparkPlugin: (plugin: Plugin) => installSparkPlugin(plugin),
  getSparkPlugin: (name: string) => getSparkPlugin(name),
  // composables / helpers
  useComponent: (config: ComponentConfig, parent?: ComponentContext) => useComponent(config, parent),
  // initialization hook (no-op by default; features may extend this with `initializeApp`)
  initialize: async () => { return Promise.resolve() },
  // Vue plugin install
  install(app: App) {
    app.provide('sparkManager', componentManager)
  }
}

export default Spark
