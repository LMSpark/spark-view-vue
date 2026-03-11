/**
 * 内部 barrel — 供 renderer/containers/ 和 renderer/fields/ 使用
 *
 * 将包内符号聚合到一个相对路径，避免各文件需要知道包内部目录结构。
 * 此文件 **不** 出现在公共 API 中，仅为内部引用服务。
 */

// ── Composable ──
export { useSparkComponent } from '../composables/useSparkComponent.js'
export type { UseSparkComponentReturn } from '../composables/useSparkComponent.js'

// ── 递归渲染器 ──
export { default as SparkComponentRenderer } from './spark/SparkComponentRenderer.vue'

// ── 核心类型 ──
export type {
  ComponentConfig,
  ComponentContext,
  LoggerApi,
} from '../core/types.js'

// ── 能力键 ──
export {
  PAGE_DATASET,
  DATA_SOURCE,
  FIELD_CONTEXT,
  CONTEXT_DATA,
} from '../capability-keys.js'
export type { FieldContext } from '../capability-keys.js'
