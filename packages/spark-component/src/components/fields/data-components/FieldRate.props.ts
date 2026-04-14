import type { SparkFieldProps } from '../../shared-types'

export interface RRateProps extends SparkFieldProps {
  width?: number
  modelValue?: number
  max?: number
  allowHalf?: boolean
}
