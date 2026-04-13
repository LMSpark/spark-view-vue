import type { SparkChildrenProps } from '../../shared-types'

export interface RBadgeProps extends SparkChildrenProps<'r-badge'> {
badgeValue?: string | number
  value?: string | number
  field?: string
  max?: number
  isDot?: boolean
  hiddenBadge?: boolean
  badgeType?: '' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
  showZero?: boolean
  color?: string
  offset?: [number, number]
  badgeStyle?: object
  badgeClass?: string
}
