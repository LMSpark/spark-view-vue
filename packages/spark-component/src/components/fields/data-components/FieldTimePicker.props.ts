import type { SparkNodeProps, SparkTemporalPickerProps } from '../../shared-types'

export type RTimePickerProps = SparkNodeProps & SparkTemporalPickerProps<string | Date> & {
  /** 是否启用时间范围选择。 */
  isRange?: boolean
  /** 是否使用箭头调整时间。 */
  arrowControl?: boolean
}
