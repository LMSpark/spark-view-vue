/**
 * @module @spark-appworks/spark-data:node-tree/index
 * @spark-appworks/spark-data 的 node-tree/index 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
export type {
  SparkNode,
  SparkNodeChildren,
} from './spark-node'

export {
  SPARK_NODE_STRUCT_KEYS,
  isSparkNode,
  normalizeSparkNode,
} from './spark-node'

export {
  getSparkNodeChildren,
  nodeId,
  nodeInputProp,
  nodeInputProps,
} from './spark-node'

export type {
  SparkNodeFindByTypeMatch,
  SparkNodeFindByTypeParams,
  SparkNodeFindByTypeResult,
  SparkNodeLocation,
  SparkNodeTreeChildrenParams,
  SparkNodeTreeLookupParams,
} from './spark-node-tree'

export type {
  SparkNodeAddResult,
  SparkNodeMoveResult,
  SparkNodeRemoveResult,
  SparkNodeReplaceResult,
  SparkNodeSetPropsResult,
} from './spark-node-tree'

export type {
  SparkNodeAddNodesResult,
  SparkNodeRemoveNodesResult,
  SparkNodeReplaceNodesResult,
  SparkNodeSetPropsBatchResult,
} from './spark-node-tree'

export type {
  SparkNodeTreeAddNodesParams,
  SparkNodeTreeAddParams,
  SparkNodeTreeMoveParams,
  SparkNodeTreeRemoveNodesParams,
  SparkNodeTreeRemoveParams,
  SparkNodeTreeReplaceNodesParams,
  SparkNodeTreeReplaceParams,
  SparkNodeTreeSetPropsParams,
} from './spark-node-tree'

export type {
  SparkNodeTreeReplaceNodesItem,
  SparkNodeTreeSetPropsBatchItem,
  SparkNodeTreeSetPropsBatchParams,
} from './spark-node-tree'

export {
  SPARK_PAGE_NODE_TYPE,
  SPARK_PAGE_ROOT_ID,
  SparkNodeTree,
} from './spark-node-tree'

export type {
  SparkNodeTreeFromJsonOptions,
  SparkNodeTreeJsonInput,
  SparkNodeTreeMethodKey,
  SparkNodeTreeRootParams,
  SparkNodeTreeRuleJsonInput,
} from './spark-node-tree'
