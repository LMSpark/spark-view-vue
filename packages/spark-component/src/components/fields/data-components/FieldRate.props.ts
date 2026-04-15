import type { SparkMaxNumericFieldProps, SparkNodeProps } from '../../shared-types'

export interface RRateProps extends SparkNodeProps, SparkMaxNumericFieldProps<number> {
  /** 是否允许选择半星。 */
  allowHalf?: boolean
}
