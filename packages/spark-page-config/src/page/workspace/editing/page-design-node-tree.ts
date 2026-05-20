import type {
  SparkNodeTree,
  SparkNodeTreeMethodKey,
} from '../../model/spark-node-tree'

export type { SparkNodeTreeMethodKey } from '../../model/spark-node-tree'
export type PageDesignNodeTree = Pick<SparkNodeTree, SparkNodeTreeMethodKey | 'toJSON'>
