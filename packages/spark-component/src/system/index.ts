/**
 * system 层入口。
 *
 * 聚合 Spark 命名空间、Vue 插件与组件注册表。
 */

export { Spark } from './spark.js'
export type {
  ComponentLoader,
  GlobModules,
  RegisterContext,
  SparkSystem,
} from './spark.js'

export { createSparkPlugin } from './plugin.js'
export type { SparkPluginOptions } from './plugin.js'

export { createComponentRegistry, getGlobalRegistry } from './registry.js'