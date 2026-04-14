import type { SparkNodeProps } from '../../shared-types'

export interface RTimelineItemProps extends SparkNodeProps {
timestamp?: string
  hideTimestamp?: boolean
  center?: boolean
  placement?: 'top' | 'bottom'
  itemType?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  color?: string
  itemSize?: 'normal' | 'large'
  hollow?: boolean
  content?: string
}
