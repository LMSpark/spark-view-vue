/**
 * components 内部聚合入口。
 *
 * 供 `components/containers/` 与 `components/fields/` 共享使用，
 * 统一收口组件层允许依赖的内部符号。
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

// ── 能力键 ──
export {
  PAGE_DATASET,
  DATA_SOURCE,
  CONTEXT_DATA,
  FIELD_CONTEXT,
  PAGE_COMPONENT_REGISTRY,
  MODULE_CONTEXT,
} from '../capabilities.js'
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
} from '../capabilities.js'
