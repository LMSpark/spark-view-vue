import type { SparkFieldProps } from '../../shared-types'

export interface RTimeSelectProps extends SparkFieldProps {
  value?: string
  start?: string
  end?: string
  step?: string
  minTime?: string
  maxTime?: string
}
