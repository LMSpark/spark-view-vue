import type { SparkFieldProps } from '../../shared-types'

export interface RRateProps extends SparkFieldProps<'r-rate'> {
  width?: number
  modelValue?: number
  max?: number
  allowHalf?: boolean
}
