import type { SparkFieldProps } from '../../shared-types'

export interface RIconProps extends SparkFieldProps<'r-icon'> {
  width?: number
  modelValue?: string
  options?: unknown[]
  optionKey?: string
  optionLabelField?: string
  optionValueField?: string
  clearable?: boolean
  filterable?: boolean
  classPrefix?: string
}
