import type { SparkFieldProps, SparkNumericMaxProps } from '../../shared-types'

export interface RRateProps extends SparkFieldProps, SparkNumericMaxProps {
  value?: number
  allowHalf?: boolean
}
