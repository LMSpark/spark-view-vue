import type { SparkChildrenProps } from '../../shared-types'

export interface RTimelineItemProps extends SparkChildrenProps<'r-timeline-item'> {
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
