import type { SparkFieldProps } from '../../shared-types'

export interface RTimeSelectProps extends SparkFieldProps {
  width?: number
  modelValue?: string
  start?: string
  end?: string
  step?: string
  minTime?: string
  maxTime?: string
  clearable?: boolean
}
