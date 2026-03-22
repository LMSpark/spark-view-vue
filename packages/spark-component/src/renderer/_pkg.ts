/**
 * 内部 barrel — 供 renderer/containers/ 和 renderer/fields/ 使用
 *
 * 将包内符号聚合到一个相对路径，避免各文件需要知道包内部目录结构。
 * 此文件 **不** 出现在公共 API 中，仅为内部引用服务。
 */

// ── Composable ──
export { useSparkComponent } from '../useSparkComponent.js'
export type { UseSparkComponentReturn } from '../useSparkComponent.js'

// ── 递归渲染器 ──
export { default as SparkComponentRenderer } from './SparkComponentRenderer.vue'

// ── 核心类型 ──
export type {
  SparkNode,
  ComponentContext,
  LoggerApi,
} from '../types.js'

// ── DI 键 ──
export { SPARK_NODE_CONFIG_KEY } from '../types.js'

// ── 能力键 ──
export {
  PAGE_DATASET,
  DATA_SOURCE,
  FIELD_CONTEXT,
  CONTEXT_DATA,
  TABLE_API,
  PAGE_COMPONENT_REGISTRY,
  MODULE_CONTEXT,
} from '../capability-keys.js'
export type {
  FieldContext,
  RendererTableApi,
  PageComponentRegistry,
  PageComponentInstanceEntry,
  PageComponentApiEntry,
  ModuleContextCapability,
} from '../capability-keys.js'
