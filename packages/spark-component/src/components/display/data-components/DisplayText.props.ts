import type { SparkComponentBaseProps } from '../../shared-types'

export interface RTextDisplayProps extends SparkComponentBaseProps<'r-text-display'> {
value?: unknown
  field?: string
  tag?: string
  prefix?: string
  suffix?: string
  format?: 'number' | 'currency' | 'percent' | 'date'
  precision?: number
  placeholder?: string
  textClass?: string
  textStyle?: object | string
}
