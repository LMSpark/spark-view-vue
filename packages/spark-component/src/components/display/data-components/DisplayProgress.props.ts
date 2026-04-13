import type { SparkComponentBaseProps } from '../../shared-types'

export type ProgressColor = string | Array<{ color: string; percentage: number }>

export interface RProgressProps extends SparkComponentBaseProps<'r-progress'> {
percentage?: number
  value?: number
  field?: string
  progressType?: 'line' | 'circle' | 'dashboard'
  strokeWidth?: number
  textInside?: boolean
  status?: 'success' | 'exception' | 'warning'
  indeterminate?: boolean
  duration?: number
  color?: ProgressColor
  circleWidth?: number
  showText?: boolean
  strokeLinecap?: 'butt' | 'round' | 'square'
  formatText?: string
}
