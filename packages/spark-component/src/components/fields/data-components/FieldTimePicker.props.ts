import type { SparkFieldProps } from '../../shared-types'

export interface RTimePickerProps extends SparkFieldProps {
  width?: number
  modelValue?: string | Date
  isRange?: boolean
  rangeSeparator?: string
  startPlaceholder?: string
  endPlaceholder?: string
  arrowControl?: boolean
  format?: string
  clearable?: boolean
}
