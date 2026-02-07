export * from './utils/SparkComponentRegistry.js'
export * from './utils/SparkComponentManager.js'
export * from './composables/useSparkComponent.js'
export * from './utils/SparkComponentRenderer.js'
export * from './vue/createSparkComponent.js'
export * from './types/index.js'
export { Spark } from './spark-namespace.js'

// Vue 插件
export { createVueSparkPlugin, type VueSparkPluginOptions } from './plugins/VueSparkPlugin.js'

// 事件系统
export {
  createComponentEventEmitter
} from './events/ComponentEventEmitter.js'

export type {
  ComponentEventProvider
} from './events/ComponentEventEmitter.js'
