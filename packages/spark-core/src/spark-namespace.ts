// Package-level SPARK namespace to simplify application imports
// Import runtime entry points from source implementations to avoid built dist dependency
import { globalSparkComponentManager } from './utils/SparkComponentManager.js'
import { globalCapabilityManager } from './utils/SparkCapabilitySystem.js'
import { globalComponentRegistry } from './utils/SparkComponentRegistry.js'
import { registerGlobalProvider, getGlobalProvider, getOrCreateNoopProvider } from './utils/GlobalProviderRegistry.js'
import { Logger as createLogger } from './utils/logger.js'
import { getSparkPlugin, installSparkPlugin } from './plugins/SparkPluginSystem.js'
import { useSparkComponent } from './composables/useSparkComponent.js'

export const Spark = {
  // manager getter used across tests and app entry
  manager: (): typeof globalSparkComponentManager => globalSparkComponentManager,
  // capability manager getter
  capabilities: (): typeof globalCapabilityManager => globalCapabilityManager,
  // registry helpers - delegated to global instances
  registerSparkComponent: (def: any) => {
    if (typeof def === 'string') throw new Error('registerSparkComponent signature changed: pass a SparkComponentDefinition object')
    return globalSparkComponentManager.registerComponent(def)
  },
  registerSparkComponents: (defs: any) => {
    if (!Array.isArray(defs)) throw new Error('registerSparkComponents expects an array of component definitions')
    return defs.forEach((d: any) => globalSparkComponentManager.registerComponent(d))
  },
  getSparkComponent: (type: string) => globalComponentRegistry.get(type)?.component,
  // global providers
  registerGlobalProvider: (name: string, provider: any) => registerGlobalProvider(name, provider),
  getGlobalProvider: (name: string) => getGlobalProvider(name),
  getOrCreateNoopProvider: (name: string, iface?: any) => getOrCreateNoopProvider(name, iface),
  // logger (single unified API)
  Logger: createLogger,
  // plugins
  installSparkPlugin: (plugin: any) => installSparkPlugin(plugin),
  getSparkPlugin: (name: string) => getSparkPlugin(name),
  // composables / helpers
  useSparkComponent: (props: any) => useSparkComponent(props),
  // Vue plugin install
  install(app: any) {
    app.provide('sparkManager', globalSparkComponentManager)
  }
}

export default Spark
