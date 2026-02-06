export * from './utils/SparkComponentRegistry.js'
export * from './utils/SparkComponentManager.js'
export * from './composables/useSparkComponent.js'
export * from './utils/SparkComponentRenderer.js'
export * from './vue/createSparkComponent.js'
export * from './types/index.js'
export { Spark } from './spark-namespace.js'

// 组件定义注册助手（简化语法）
export { 
  createSimpleRegistration,
  batchCreateSimpleRegistrations,
  presets as registerPresets,
  nameToType
} from './helpers/registerHelper.js'

// 事件系统
export {
  createComponentEventEmitter
} from './events/ComponentEventEmitter.js'

export type {
  ComponentEventProvider
} from './events/ComponentEventEmitter.js'

// 权限系统（从 spark-utils 转发）
export {
  PermissionChecker,
  createPermissionChecker, 
  checkPermission,
  PermissionFilter,
  createPermissionFilter,
  filterByPermission,
  FieldRenderHelper,
  createFieldRenderHelper,
  computeFieldState,
  computeFieldStates,
  filterVisibleFields
} from '@spark-view/spark-utils'

// 工厂函数（推荐使用）
export { createComponentRegistry } from './utils/SparkComponentRegistry.js'
export { createComponentManager } from './utils/SparkComponentManager.js'
export { defineSparkComponent } from './vue/createSparkComponent.js'

// 实现类（用于测试和高级用法）
export { SparkComponentManagerImpl } from './utils/SparkComponentManager.js'
export { SparkComponentRendererImpl } from './utils/SparkComponentRenderer.js'

// 插件系统类型
export type { Plugin as SparkPlugin, PluginHooks as SparkPluginHooks } from './types/spark-component.js'

// Vue 依赖注入 Key
export { SPARK_MANAGER_KEY, SPARK_REGISTRY_KEY } from './types/spark-component.js'
