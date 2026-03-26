/**
 * components 内部聚合入口。
 *
 * 供 `components/containers/` 与 `components/fields/` 共享使用，
 * 统一收口组件层允许依赖的内部符号。
 */

// ── Composable ──
export { useSparkComponent, useSparkConsume } from '../core/index.js'
export type { UseSparkComponentReturn, UseSparkCapabilityReaderReturn, UseSparkComponentOptions } from '../core/index.js'

// ── 递归渲染器 ──
export { default as SparkComponentRenderer } from './SparkComponentRenderer.vue'

// ── 分层 composable 入口（发现职责优先于猜文件名）──
export * as containerComposables from './containers/composables.js'
export * as containerDataComponents from './containers/data-components/index.js'
export * as containerNonDataComponents from './containers/non-data-components/index.js'
export * as containerDataComponentComposables from './containers/data-components/composables/index.js'
export * as containerNonDataComponentComposables from './containers/non-data-components/composables/index.js'
export * as containerDataComponentSupport from './containers/data-components/support/index.js'
export * as containerDataUi from './containers/data-components/index.js'
export * as containerNonDataUi from './containers/non-data-components/index.js'
export * as containerDataUiComposables from './containers/data-components/composables/index.js'
export * as containerNonDataUiComposables from './containers/non-data-components/composables/index.js'
export * as containerActionComposables from './containers/actions/index.js'
export * as containerContextComposables from './containers/context/index.js'
export * as containerDataComposables from './containers/data/index.js'
export * as containerLayoutComposables from './containers/layout/index.js'
export * as fieldComposables from './fields/composables.js'
export * as fieldDataComponents from './fields/data-components/index.js'
export * as fieldNonDataComponents from './fields/non-data-components/index.js'
export * as fieldDataComponentComposables from './fields/data-components/composables/index.js'
export * as fieldNonDataComponentComposables from './fields/non-data-components/composables/index.js'
export * as fieldDataComponentSupport from './fields/data-components/support/index.js'
export * as fieldDataUi from './fields/data-components/index.js'
export * as fieldNonDataUi from './fields/non-data-components/index.js'
export * as fieldDataUiComposables from './fields/data-components/composables/index.js'
export * as fieldNonDataUiComposables from './fields/non-data-components/composables/index.js'
export * as fieldContextComposables from './fields/context/index.js'
export * as fieldOptionComposables from './fields/options/index.js'
export * as fieldActionComposables from './fields/actions/index.js'

// ── 核心类型 ──
export type {
  SparkNode,
  SparkNodeChildren,
  SparkCapabilityContext,
  LoggerApi,
} from '../core/index.js'
export { nodeId, nodeInputProp, nodeInputProps, SPARK_NODE_STRUCT_KEYS, DEFAULT_DOCK, normalizeSparkNode, nodeDock, nodeOrder, getDockedChildren, isSparkNode, getSparkNodeChildren } from '../core/index.js'

// ── 能力键 ──
export {
  PAGE_DATASET,
  DATA_SOURCE,
  CONTEXT_DATA,
  FIELD_CONTEXT,
  PAGE_COMPONENT_REGISTRY,
  MODULE_CONTEXT,
} from '../core/index.js'
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
} from '../core/index.js'
