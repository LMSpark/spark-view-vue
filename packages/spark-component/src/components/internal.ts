/**
 * components 内部桥接层。
 *
 * 供 `components/containers/` 与 `components/fields/` 共享使用，
 * 统一收口组件层允许依赖的 core 层符号。
 *
 * 只重导出 core 层的具名符号，不做命名空间聚合。
 */

// ── Composable ──
export { useSparkComponent, useSparkConsume, useSparkPageComponent, useSparkContextScope } from '../core/index.js'
export type {
  UseSparkComponentReturn,
  UseSparkPageComponentReturn,
  UseSparkCapabilityReaderReturn,
  UseSparkComponentOptions,
  SparkNodeInput,
} from '../core/index.js'

// ── 递归渲染器 ──
export { default as SparkComponentRenderer } from './SparkComponentRenderer.vue'

// ── 核心类型 ──
export type {
  SparkNode,
  SparkNodeChildren,
  SparkCapabilityContext,
  LoggerApi,
} from '../core/index.js'
export { nodeId, nodeInputProp, nodeInputProps, SPARK_NODE_STRUCT_KEYS, normalizeSparkNode, isSparkNode, getSparkNodeChildren } from '../core/index.js'

// ── 能力键 ──
export {
  APP_SERVICES,
  PAGE_SERVICE,
  PAGE_DATASET,
  DATA_SOURCE,
  DATA_ROW,
  PAGE_COMPONENT_REGISTRY,
  MODULE_CONTEXT,
  findNearestCapabilityProvider,
  findNearestCapabilityProviderByKeys,
  consumeCapabilityFromProvider,
} from '../core/index.js'
export type {
  IAppServicesCapability,
  IPageServiceCapability,
  IModuleContext,
  PageMessageType,
  PageDialogResult,
  IPageDialogOptions,
  IPageBrowseFilesOptions,
  IPageUploadFilesOptions,
  IPageSelectEntitiesOptions,
  PageSelectableValue,
  IPageSelectedEntity,
  IPageSelectedFile,
  IPageUploadedFile,
  PageComponentRegistry,
  PageComponentInstanceEntry,
  PageComponentApiEntry,
  ModuleContextCapability,
} from '../core/index.js'

// ── 事件控制 ──
export { createCancellableControl, isCancellableControl, type CancellableControl } from './containers/support/interactionControl.js'
