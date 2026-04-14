import type { SparkFieldProps, SparkMultilineRowsProps } from '../../shared-types'

export interface RTextareaProps extends SparkFieldProps, SparkMultilineRowsProps {
  value?: string
  autosize?: boolean | { minRows?: number; maxRows?: number }
  maxlength?: number
  showWordLimit?: boolean
}
