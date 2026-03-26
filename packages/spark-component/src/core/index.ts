/**
 * core 层入口。
 *
 * 聚合 spark-component 的基础内核：
 * - useSparkComponent
 * - 核心类型
 * - capability keys
 */

export { useSparkComponent, useSparkConsume } from './useSparkComponent.js'
export type {
  UseSparkComponentReturn,
  UseSparkCapabilityReaderReturn,
  UseSparkComponentOptions,
  SparkNodeInput,
} from './useSparkComponent.js'

export type {
  CapabilityName,
  SparkCapabilityContext,
  SparkNode,
  SparkNodeChildren,
  DockDescriptor,
  DockToolbar,
  DockActions,
  DockFilterItem,
  DockFilter,
  ContainerDocks,
  ComponentDefinition,
  ComponentRegistry,
  LoggerApi,
} from './types.js'

export {
  SPARK_REGISTRY_KEY,
  SPARK_NODE_STRUCT_KEYS,
  DEFAULT_DOCK,
  normalizeSparkNode,
  nodeId,
  nodeInputProp,
  nodeInputProps,
  nodeDock,
  nodeOrder,
  getDockedChildren,
  isSparkNode,
  getSparkNodeChildren,
} from './types.js'

export * from './capabilities.js'
export type * from './capabilities.js'
