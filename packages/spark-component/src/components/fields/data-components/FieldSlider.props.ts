import type { SparkFieldProps, SparkNumericBoundsProps } from '../../shared-types'

export interface RSliderProps extends SparkFieldProps, SparkNumericBoundsProps {
  value?: number
  step?: number
  showInput?: boolean
}
