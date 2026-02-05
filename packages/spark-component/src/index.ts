export * from './utils/SparkComponentRegistry.js'
// SparkCapabilitySystem 将被移除，统一使用 @spark-view/spark-utils
// export * from './utils/SparkCapabilitySystem.js'
export * from './utils/SparkComponentManager.js'
// export * from './composables/index.js' // Empty file, commented out
export * from './composables/useSparkComponent.js'
export * from './utils/SparkComponentRenderer.js'
export * from './vue/createSparkComponent.js'
export * from './types/index.js'
export { Spark } from './spark-namespace.js'

// 简化注册助手
export { 
  createSimpleRegistration,
  batchCreateSimpleRegistrations,
  presets as registerPresets,
  nameToType
} from './helpers/registerHelper.js'
export type { SimpleComponentConfig } from './helpers/registerHelper.js'

// 权限系统类型（转发导出，实际定义在 spark-data）
export type {
  // 以下类型来自 spark-data（数据类型唯一来源）
  IModelPermission,          // 模型级权限
  IInstancePermission,       // 实例级权限
  WithInstancePermission,    // 权限工具类型
  WithModelPermission,       // 权限工具类型
  DataRow,                   // 组件层数据行（基于 spark-data.DataRow + 权限）
  DataSet,                   // 组件层数据集（便捷接口）
  
  // 以下类型为组件层特有
  IPermissionChecker,        // 权限检查器
  IPermissionFilter,         // 权限过滤器
  FieldVisibility,           // 字段可见性枚举
  ComponentLevel             // 组件级别枚举
} from './types/permission.js'

// Event System
export {
  createComponentEventEmitter,
  createComponentEventConsumer,
  ComponentEvents
} from './events/ComponentEventEmitter.js'

export type {
  ComponentEventProvider,
  ComponentEventConsumer,
  ComponentEventType
} from './events/ComponentEventEmitter.js'

// Event Capability Integration
// 现在从 @spark-view/spark-utils 导出
export {
  EventCapabilityConnector,
  createEventCapabilityProvider,
  createEventCapabilityConsumer,
  type EventCapabilityProvider,
  type EventCapabilityConsumer
} from '@spark-view/spark-utils'

// Permission System
export * from './permission/index.js'

// Primary unified API for creating Spark components
export { defineSparkComponent } from './vue/createSparkComponent.js'

// Factory functions for creating instances
export { createComponentRegistry } from './utils/SparkComponentRegistry.js'
export { createComponentManager } from './utils/SparkComponentManager.js'

// Implementation classes for testing/advanced usage
export { SparkComponentManagerImpl } from './utils/SparkComponentManager.js'
export { SparkComponentRendererImpl } from './utils/SparkComponentRenderer.js'

// Plugin system exports
export type { Plugin as SparkPlugin, PluginHooks as SparkPluginHooks } from './types/spark-component.js'

// DI keys for Vue injection
export { SPARK_MANAGER_KEY, SPARK_REGISTRY_KEY } from './types/spark-component.js'

// NOTE: prefer factories (createComponentManager/createComponentRegistry) for explicit instances; singletons are still available via existing exports.
