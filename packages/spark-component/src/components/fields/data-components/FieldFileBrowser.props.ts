import type { SparkFieldProps } from '../../shared-types'

export interface RFileBrowserProps extends SparkFieldProps<'r-file-browser'> {
  width?: number
  modelValue?: string
  accept?: string
  multiple?: boolean
  clearable?: boolean
  separator?: string
  buttonText?: string
}
