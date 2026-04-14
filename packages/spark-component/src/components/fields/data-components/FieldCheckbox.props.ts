import type { SparkFieldProps } from '../../shared-types'

export interface RCheckboxProps extends SparkFieldProps {
  value?: boolean
  checkedText?: string
  uncheckedText?: string
  checkboxText?: string
}
