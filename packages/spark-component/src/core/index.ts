/**
 * core 层入口。
 *
 * 聚合 spark-component 的基础内核：
 * - useSparkComponent
 * - 核心类型
 * - capability keys
 */

export { useSparkComponent, useSparkConsume, useSparkPageComponent, resolvePlaceholderProps } from './useSparkComponent.js'
export { useSparkContextScope } from './useSparkComponent.js'
export type {
  UseSparkComponentReturn,
  UseSparkPageComponentReturn,
  UseSparkCapabilityReaderReturn,
  UseSparkComponentOptions,
  SparkNodeInput,
} from './useSparkComponent.js'
export type {
} from './useSparkComponent.js'

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
  SparkNodeTreeFromJsonOptions,
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
  SparkNodeFindByTypeParams,
  SparkNodeFindByTypeMatch,
  SparkNodeFindByTypeResult,
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

export type {
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
} from '@spark-view/spark-utils'

export {
  APP_SERVICES,
  PAGE_SERVICE,
  PAGE_PERMISSION_MODE,
  PAGE_COMPONENT_REGISTRY,
  MODULE_CONTEXT,
  CSS_SCOPE,
} from '@spark-view/spark-utils'

export {
  PAGE_DATASET,
  DATA_SOURCE,
  DATA_ROW,
} from './capability-keys.js'

export {
  findNearestCapabilityProvider,
  findNearestCapabilityProviderByKeys,
  consumeCapabilityFromProvider,
} from '@spark-view/spark-utils'

export type {
  PageComponentInstanceEntry,
  PageComponentApiEntry,
  PageComponentRegistry,
  ModuleContextCapability,
  PageCssScopeCapability,
} from '@spark-view/spark-utils'
