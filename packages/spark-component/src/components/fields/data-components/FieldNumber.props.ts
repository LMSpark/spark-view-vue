import type { SparkNodeProps, SparkRangeNumericFieldProps } from '../../shared-types'

export type RNumberProps = SparkNodeProps & SparkRangeNumericFieldProps<number | [number | undefined, number | undefined]> & {
  /** 数值展示与写回时使用的小数精度。 */
  precision?: number
}
