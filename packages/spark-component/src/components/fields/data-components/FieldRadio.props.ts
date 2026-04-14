import type { SparkFieldProps } from '../../shared-types'

export interface RRadioProps extends SparkFieldProps {
  width?: number
  modelValue?: string | number
  options?: unknown[]
  optionKey?: string
  optionLabelField?: string
  optionValueField?: string
  buttonStyle?: boolean
}
