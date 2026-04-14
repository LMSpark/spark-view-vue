import type { SparkFieldProps } from '../../shared-types'

export interface RFileBrowserProps extends SparkFieldProps {
  width?: number
  modelValue?: string
  accept?: string
  multiple?: boolean
  clearable?: boolean
  separator?: string
  buttonText?: string
}
