import type { SparkMaxNumericFieldProps, SparkNodeProps } from '../../shared-types'

export type RRateProps = SparkNodeProps & SparkMaxNumericFieldProps<number> & {
  /** 是否允许选择半星。 */
  allowHalf?: boolean
}
