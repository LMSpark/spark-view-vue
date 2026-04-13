import type { SparkFieldProps } from '../../shared-types'

export interface RImageProps extends SparkFieldProps<'r-image'> {
  width?: number
  modelValue?: string
  action?: string
  accept?: string
  multiple?: boolean
  separator?: string
  buttonText?: string
  readonlyButtonText?: string
  clearable?: boolean
}
