/**
 * core 层入口。
 *
 * 聚合 spark-component 的基础内核：
 * - useSparkComponent
 * - 核心类型
 * - capability keys
 */

export { useSparkComponent, useSparkConsume, useSparkPageComponent } from './useSparkComponent.js'
export { useSparkHost, useSparkHostScope, resolveSparkHost, resolveSparkHostType } from './useSparkHost.js'
export type {
  UseSparkComponentReturn,
  UseSparkPageComponentReturn,
  UseSparkCapabilityReaderReturn,
  UseSparkComponentOptions,
  SparkNodeInput,
} from './useSparkComponent.js'
export type {
  SparkHostResolverOptions,
  ResolvedSparkHost,
  UseSparkHostReturn,
  UseSparkHostScopeReturn,
} from './useSparkHost.js'

export type {
  CapabilityName,
  SparkCapabilityContext,
  SparkNode,
  SparkNodeChildren,
  DockFilterItem,
  ComponentDefinition,
  ComponentRegistry,
  LoggerApi,
} from './types.js'

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

export {
  PAGE_DATASET,
  DATA_SOURCE,
  DATA_ROW,
  PAGE_COMPONENT_REGISTRY,
  MODULE_CONTEXT,
  CSS_SCOPE,
} from './capabilities.js'

export type {
  PageComponentInstanceEntry,
  PageComponentApiEntry,
  PageComponentRegistry,
  ModuleContextCapability,
  PageCssScopeCapability,
} from './capabilities.js'
