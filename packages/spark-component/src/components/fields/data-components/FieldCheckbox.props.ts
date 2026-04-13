import type { SparkFieldProps } from '../../shared-types'

export interface RCheckboxProps extends SparkFieldProps<'r-checkbox'> {
  width?: number
  modelValue?: boolean
  checkedText?: string
  uncheckedText?: string
  checkboxText?: string
}
