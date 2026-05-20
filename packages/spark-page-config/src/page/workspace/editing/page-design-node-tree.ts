import type {
  SparkNodeTree,
  SparkNodeTreeMethodKey,
} from '../../model/spark-node-tree'

export type { SparkNodeTreeMethodKey } from '../../model/spark-node-tree'
export interface PageDesignNodeTree extends Pick<SparkNodeTree, SparkNodeTreeMethodKey | 'toJSON'> {}
