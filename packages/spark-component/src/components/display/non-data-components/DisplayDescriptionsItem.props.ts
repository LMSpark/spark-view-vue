import type { SparkNodeProps } from '../../shared-types'

export interface RDescriptionsItemProps extends SparkNodeProps {
label?: string
  span?: number
  labelAlign?: 'left' | 'center' | 'right'
  contentAlign?: 'left' | 'center' | 'right'
  labelClassName?: string
  className?: string
  content?: string
  value?: unknown
  field?: string
}
