import type { App } from 'vue'
import type { ComponentManager, ComponentRegistry } from '../types/spark-component.js'
import { SPARK_MANAGER_KEY, SPARK_REGISTRY_KEY } from '../types/spark-component.js'

export interface VueSparkPluginOptions {
  manager: ComponentManager
  registry?: ComponentRegistry
}

export function createVueSparkPlugin(options: VueSparkPluginOptions) {
  if (!options?.manager) throw new Error('VueSparkPlugin requires { manager } option. Provide a manager created by createComponentManager(registry)')
  const { manager, registry } = options
  return {
    name: 'spark-vue-plugin',
    install(app: App) {
      // Provide strict DI into Vue app using Symbols (no magic strings)
      app.provide(SPARK_MANAGER_KEY, manager)
      if (registry) app.provide(SPARK_REGISTRY_KEY, registry)
    }
  } 
}
