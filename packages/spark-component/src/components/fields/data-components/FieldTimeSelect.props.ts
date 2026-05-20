import type { SparkFieldSemanticProps, SparkNodeProps } from '../../shared-types'

export type RTimeSelectProps = SparkNodeProps & SparkFieldSemanticProps<string> & {
  /** 可选时间段的起始时间。 */
  start?: SparkText
  /** 可选时间段的结束时间。 */
  end?: SparkText
  /** 相邻时间选项之间的步长。 */
  step?: SparkText
  /** 可选择的最小时间。 */
  minTime?: SparkText
  /** 可选择的最大时间。 */
  maxTime?: SparkText
}
