/**
 * SPARK 组件系统 - 公共 API
 *
 * 精简导出：
 * - Spark 命名空间（统一入口）
 * - useSparkComponent（组件开发 Composable）
 * - createSparkPlugin（Vue 插件）
 * - 核心类型
 */

// === 命名空间 ===
export { Spark } from './spark.js'

// === Composable ===
export { useSparkComponent } from './composables/useSparkComponent.js'
export type { UseSparkComponentReturn } from './composables/useSparkComponent.js'

// === Vue 插件 ===
export { createSparkPlugin } from './plugins/SparkPlugin.js'
export type { SparkPluginOptions } from './plugins/SparkPlugin.js'

// === 工厂函数 ===
export { createComponentRegistry, getGlobalRegistry } from './registry/ComponentRegistry.js'
export { createCapabilityManager } from './capability/CapabilityManager.js'
export type { CapabilityManager } from './capability/CapabilityManager.js'

// === 核心类型 ===
export type {
  CapabilityName,
  ComponentContext,
  ComponentDefinition,
  ComponentRegistry,
  CapabilityProvider,
  CapabilityConsumer,
  LogLevel,
  LoggerApi,
  Transport
} from './core/types.js'

// === DI Keys ===
export { SPARK_REGISTRY_KEY, SPARK_PARENT_CONTEXT_KEY, CAPABILITY_MANAGER_KEY } from './core/types.js'
