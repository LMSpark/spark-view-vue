import type {
  SparkNodeTree,
  SparkNodeTreeMethodKey as PageConfigSparkNodeTreeMethodKey,
} from '../../model/spark-node-tree'

export type SparkNodeTreeMethodKey = PageConfigSparkNodeTreeMethodKey
export type PageDesignNodeTree = Pick<SparkNodeTree, SparkNodeTreeMethodKey | 'toJSON'>
