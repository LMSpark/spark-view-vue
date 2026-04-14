import type { SparkFieldProps } from '../../shared-types'

export interface RSelectProps extends SparkFieldProps {
  width?: number
  modelValue?: string | number
  options?: unknown[]
  optionKey?: string
  optionLabelField?: string
  optionValueField?: string
  clearable?: boolean
  filterable?: boolean
}
