import type { SparkFieldSemanticProps, SparkNodeProps } from '../../shared-types'

export interface RTimeSelectProps extends SparkNodeProps, SparkFieldSemanticProps<string> {
  /** 可选时间段的起始时间。 */
    start?: string
    /** 可选时间段的结束时间。 */
    end?: string
    /** 相邻时间选项之间的步长。 */
    step?: string
    /** 可选择的最小时间。 */
    minTime?: string
    /** 可选择的最大时间。 */
    maxTime?: string
}
