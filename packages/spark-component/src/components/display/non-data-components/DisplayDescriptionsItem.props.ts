import type { SparkChildrenProps } from '../../shared-types'

export interface RDescriptionsItemProps extends SparkChildrenProps<'r-descriptions-item'> {
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
