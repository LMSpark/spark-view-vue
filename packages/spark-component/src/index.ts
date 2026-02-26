/**
 * SPARK 组件系统 - 公共 API
 *
 * @packageDocumentation
 */

// ── 1. 命名空间 ──
export { Spark } from './spark.js'
export type {
  ComponentLoader,
  GlobModules,
  RegisterContext,
  SparkSystem
} from './spark.js'

// ── 2. 组件开发 Composable ──
export { useSparkComponent } from './composables/useSparkComponent.js'
export type { UseSparkComponentReturn } from './composables/useSparkComponent.js'

// ── 3. Vue 插件 ──
export { createSparkPlugin } from './plugins/SparkPlugin.js'
export type { SparkPluginOptions } from './plugins/SparkPlugin.js'

// ── 4. 注册表 ──
export { createComponentRegistry, getGlobalRegistry } from './registry/ComponentRegistry.js'

// ── 5. 核心类型 ──
export type {
  CapabilityName,
  ComponentConfig,
  ComponentContext,
  ComponentDefinition,
  ComponentRegistry,
  LoggerApi
} from './core/types.js'

// ── 6. DI Keys ──
export { SPARK_REGISTRY_KEY, SPARK_PARENT_CONTEXT_KEY } from './core/types.js'

// ── 7. 页面渲染引擎 ──
export {
  FCPageRenderer,
  usePageRenderer,
  usePageDataSet,
  SparkPageRenderer,
  useJsonRenderer,
  SparkComponentRenderer,
  bindDataToRules
} from './renderer/index.js'

export type {
  UsePageRendererReturn,
  UsePageRendererRefs,
  UsePageDataSetOptions,
  UsePageDataSetReturn,
  UseJsonRendererReturn
} from './renderer/index.js'

export type {
  Rule,
  FormCreateAPI,
  PageContext,
  PageConfig,
  PageRendererOptions,
  RuleBindingOptions,
  JsonRendererOptions
} from './renderer/index.js'
