/**
 * SPARK 组件系统 - 公共 API
 *
 * 提供 SPARK 组件系统的完整功能接口，包括：
 * - Spark 命名空间（统一入口）
 * - useSparkComponent（组件开发 Composable）
 * - createSparkPlugin（Vue 插件）
 * - 核心类型和工厂函数
 *
 * @packageDocumentation
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 命名空间
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** SPARK 命名空间：统一 API 入口 */
export { Spark } from './spark.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. 组件开发 Composable
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 组件开发 Composable：提供组件上下文和能力系统访问 */
export { useSparkComponent } from './composables/useSparkComponent.js'
export type { UseSparkComponentReturn } from './composables/useSparkComponent.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Vue 插件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Vue 插件：集成 SPARK 系统到 Vue 应用 */
export { createSparkPlugin } from './plugins/SparkPlugin.js'
export type { SparkPluginOptions } from './plugins/SparkPlugin.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 工厂函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 组件注册表工厂函数 */
export { createComponentRegistry, getGlobalRegistry } from './registry/ComponentRegistry.js'

// 注意：provide, lookup, createEventEmitter 应直接从 @spark-view/spark-utils 导入

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. 核心类型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 核心类型定义 */
export type {
  CapabilityName,
  ComponentConfig,
  ComponentContext,
  ComponentDefinition,
  ComponentRegistry,
  LogLevel,
  LoggerApi
} from './core/types.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. DI 依赖注入 Keys
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Vue 依赖注入的 Symbol Keys */
export { SPARK_REGISTRY_KEY, SPARK_PARENT_CONTEXT_KEY } from './core/types.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. 智能加载器（Auto Loader）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 智能组件自动加载器：自动扫描、分析和注册组件 */
export { AutoLoader, createAutoLoader } from './loader/index.js'
export type { AutoLoaderConfig, ComponentMetadata, LoadStrategy } from './loader/index.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. 页面渲染引擎（原 spark-renderer 包）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** PageRenderer 组件、页面编排 Composable 及类型（通过 renderer/index.ts 中间层导出，避免此文件直接引用 .vue） */
export {
  PageRenderer,
  usePageRenderer
} from './renderer/index.js'

export type {
  UsePageRendererReturn,
  UsePageRendererRefs
} from './renderer/index.js'

export type {
  Rule,
  FormCreateAPI,
  PageContext,
  PageConfig,
  PageRendererOptions,
  RuleBindingOptions
} from './renderer/index.js'
