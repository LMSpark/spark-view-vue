import type { SparkFieldProps } from '../../shared-types'

export interface RTextareaProps extends SparkFieldProps {
  width?: number
  modelValue?: string
  rows?: number
  autosize?: boolean | { minRows?: number; maxRows?: number }
  maxlength?: number
  showWordLimit?: boolean
}
