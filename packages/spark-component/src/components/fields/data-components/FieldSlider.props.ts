import type { SparkFieldProps } from '../../shared-types'

export interface RSliderProps extends SparkFieldProps {
  width?: number
  modelValue?: number
  min?: number
  max?: number
  step?: number
  showInput?: boolean
}
