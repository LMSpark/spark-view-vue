/**
 * 内部 barrel — 供 renderer/containers/ 和 renderer/fields/ 使用
 *
 * 将包内符号聚合到一个相对路径，避免各文件需要知道包内部目录结构。
 * 此文件 **不** 出现在公共 API 中，仅为内部引用服务。
 */

// ── Composable ──
export { useSparkComponent } from '../useSparkComponent.js'
export type { UseSparkComponentReturn, UseSparkCapabilityReaderReturn, UseSparkComponentOptions } from '../useSparkComponent.js'

// ── 递归渲染器 ──
export { default as SparkComponentRenderer } from './SparkComponentRenderer.vue'

// ── 核心类型 ──
export type {
  SparkNode,
  ComponentContext,
  LoggerApi,
} from '../types.js'
export { nodeId, SPARK_NODE_STRUCT_KEYS, DEFAULT_DOCK, nodeDock, nodeOrder, getDockedChildren } from '../types.js'

// ── DI 键 ──


// ── 能力键 ──
export {
  PAGE_DATASET,
  DATA_SOURCE,
  FIELD_CONTEXT,
  CONTEXT_DATA,
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
