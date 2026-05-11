import type {
  SparkNodeTree,
  SparkNodeTreeMethodKey as PageConfigSparkNodeTreeMethodKey,
} from '@spark-view/spark-page-config'

export type SparkNodeTreeMethodKey = PageConfigSparkNodeTreeMethodKey
export type PageDesignNodeTree = Pick<SparkNodeTree, SparkNodeTreeMethodKey | 'toJSON'>
