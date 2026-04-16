/**
 * core 层入口。
 *
 * 聚合 spark-component 的基础内核：
 * - useSparkComponent
 * - 核心类型
 * - capability keys
 */

export { useSparkComponent, useSparkConsume, useSparkPageComponent, resolvePlaceholderProps } from './useSparkComponent.js'
export { useSparkHostScope } from './useSparkHost.js'
export type {
  UseSparkComponentReturn,
  UseSparkPageComponentReturn,
  UseSparkCapabilityReaderReturn,
  UseSparkComponentOptions,
  SparkNodeInput,
} from './useSparkComponent.js'
export type {
} from './useSparkHost.js'

export type {
  CapabilityName,
  SparkCapabilityContext,
  SparkNode,
  SparkNodeChildren,
  FilterItemConfig,
  ComponentDefinition,
  ComponentRegistry,
  LoggerApi,
} from './types.js'

export type {
  SparkNodeTreeRootParams,
  SparkNodeTreeLookupParams,
  SparkNodeTreeChildrenParams,
  SparkNodeTreeAddParams,
  SparkNodeTreeSetPropsParams,
  SparkNodeTreeReplaceParams,
  SparkNodeTreeRemoveParams,
  SparkNodeLocation,
  SparkNodeAddResult,
  SparkNodeSetPropsResult,
  SparkNodeReplaceResult,
  SparkNodeRemoveResult,
} from './spark-node-tree.js'

export { SPARK_REGISTRY_KEY } from '../system/keys.js'

export {
  SPARK_NODE_STRUCT_KEYS,
  normalizeSparkNode,
  nodeId,
  nodeInputProp,
  nodeInputProps,
  isSparkNode,
  getSparkNodeChildren,
} from './types.js'

export { SparkNodeTree } from './spark-node-tree.js'

export {
  defineCapability,
  normalizeKey,
  sparkProvide,
  sparkConsume,
  APP_SERVICES,
  LOGGER,
  PAGE_SERVICE,
  THEME,
} from './capability-system.js'

export type {
  CapabilityKey,
  CapabilityTypeMap,
  ICapabilityContext,
  IAppServicesCapability,
  IPageServiceCapability,
  IThemeCapability,
  ThemeMode,
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
  IEventEmitter,
} from './capability-system.js'

export {
  PAGE_DATASET,
  DATA_SOURCE,
  DATA_ROW,
  PAGE_COMPONENT_REGISTRY,
  MODULE_CONTEXT,
  CSS_SCOPE,
  ACTION_CAPABILITY,
  HOST_FIELD_MODE,
  HOST_VARIANT,
  findNearestHost,
  createActionCapability,
  createFieldHost,
  createToolbarHost,
  createRowActionHost,
} from './capabilities.js'

export type {
  PageComponentInstanceEntry,
  PageComponentApiEntry,
  PageComponentRegistry,
  ModuleContextCapability,
  PageCssScopeCapability,
  SparkHostLink,
  SparkActionCapability,
  HostVariant,
} from './capabilities.js'
