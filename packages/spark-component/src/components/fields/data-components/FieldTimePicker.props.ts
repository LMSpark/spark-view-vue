import type { SparkTemporalPickerProps } from '../../shared-types'

export interface RTimePickerProps extends SparkTemporalPickerProps {
  value?: string | Date
  isRange?: boolean
  arrowControl?: boolean
}
