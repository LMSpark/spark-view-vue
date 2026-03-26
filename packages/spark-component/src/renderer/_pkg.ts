/**
 * 内部 barrel — 供 renderer/containers/ 和 renderer/fields/ 使用
 *
 * 将包内符号聚合到一个相对路径，避免各文件需要知道包内部目录结构。
 * 此文件 **不** 出现在公共 API 中，仅为内部引用服务。
 */

// ── Composable ──
export { useSparkComponent, useSparkConsume } from '../useSparkComponent.js'
export type { UseSparkComponentReturn, UseSparkCapabilityReaderReturn, UseSparkComponentOptions } from '../useSparkComponent.js'

// ── 递归渲染器 ──
export { default as SparkComponentRenderer } from './SparkComponentRenderer.vue'

// ── 核心类型 ──
export type {
  SparkNode,
  SparkNodeChildren,
  ComponentContext,
  LoggerApi,
} from '../types.js'
export { nodeId, nodeInputProp, nodeInputProps, SPARK_NODE_STRUCT_KEYS, DEFAULT_DOCK, normalizeSparkNode, nodeDock, nodeOrder, getDockedChildren, isSparkNode, getSparkNodeChildren } from '../types.js'

// ── DI 键 ──


// ── 能力键 ──
export {
  PAGE_DATASET,
  DATA_SOURCE,
  CONTEXT_DATA,
  FIELD_CONTEXT,
  PAGE_COMPONENT_REGISTRY,
  MODULE_CONTEXT,
} from '../capability-keys.js'
export type {
  FieldContext,
  RendererTableApi,
  RendererFormApi,
  RendererDetailApi,
  RendererTreeApi,
  RendererListApi,
  RendererDialogApi,
  RendererDrawerApi,
  RendererTabsApi,
  RendererCollapseApi,
  RendererStepsApi,
  RendererSectionApi,
  PageComponentRegistry,
  PageComponentInstanceEntry,
  PageComponentApiEntry,
  ModuleContextCapability,
} from '../capability-keys.js'
