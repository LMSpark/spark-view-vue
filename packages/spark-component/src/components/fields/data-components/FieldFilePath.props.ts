import type { SparkFieldProps } from '../../shared-types'

export interface RFilePathProps extends SparkFieldProps<'r-file-path'> {
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
