// Package-level SPARK namespace to simplify application imports
// Import runtime entry points from source implementations to avoid built dist dependency
import { getGlobalSparkComponentManager } from './utils/SparkComponentManager.js'
import { getGlobalCapabilityManager } from './utils/SparkCapabilitySystem.js'
import { registerSparkComponent, registerSparkComponents, getSparkComponent } from './utils/componentRegistry.js'
import { registerGlobalProvider, getGlobalProvider, getOrCreateNoopProvider } from './utils/GlobalProviderRegistry.js'
import { getLogger } from './utils/logger.js'
import { getSparkPlugin, installSparkPlugin } from './plugins/SparkPluginSystem.js'
import { useSparkComponent } from './composables/useSparkComponent.js'

export const Spark = {
  // manager getter used across tests and app entry
  manager: (): ReturnType<typeof getGlobalSparkComponentManager> => getGlobalSparkComponentManager(),
  // capability manager getter
  capabilities: (): ReturnType<typeof getGlobalCapabilityManager> => getGlobalCapabilityManager(),
  // registry helpers (backwards-compatible wrappers)
  registerSparkComponent: (def: any) => {
    if (typeof def === 'string') return registerSparkComponent(def, undefined as any)
    return registerSparkComponent(def.type, def.component || def)
  },
  registerSparkComponents: (defs: any) => {
    if (Array.isArray(defs)) {
      const rec: Record<string, any> = {}
      defs.forEach((d: any) => { rec[d.type] = d.component || d })
      return registerSparkComponents(rec)
    }
    return registerSparkComponents(defs)
  },
  getSparkComponent: (type: string) => getSparkComponent(type),
  // global providers
  registerGlobalProvider: (name: string, provider: any) => registerGlobalProvider(name, provider),
  getGlobalProvider: (name: string) => getGlobalProvider(name),
  getOrCreateNoopProvider: (name: string, iface?: any) => getOrCreateNoopProvider(name, iface),
  // logger
  getLogger: (context?: any) => getLogger(context),
  // plugins
  installSparkPlugin: (plugin: any) => installSparkPlugin(plugin),
  getSparkPlugin: (name: string) => getSparkPlugin(name),
  // composables / helpers
  useSparkComponent: (props: any) => useSparkComponent(props),
  // Vue plugin install
  install(app: any) {
    app.provide('sparkManager', getGlobalSparkComponentManager())
  }
}

export default Spark
