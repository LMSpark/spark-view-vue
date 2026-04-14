import type { SparkFieldProps } from '../../shared-types'

export type CheckboxGroupMultiValue = Array<string | number | boolean>

export interface RCheckboxGroupProps extends SparkFieldProps {
  width?: number
  modelValue?: CheckboxGroupMultiValue
  options?: unknown[]
  optionKey?: string
  optionLabelField?: string
  optionValueField?: string
  buttonStyle?: boolean
}
