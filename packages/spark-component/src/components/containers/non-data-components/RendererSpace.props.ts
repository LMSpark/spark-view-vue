import type { SparkChildrenProps } from '../../shared-types'

export interface RSpaceProps extends SparkChildrenProps<'r-space'> {
  direction?: 'horizontal' | 'vertical'
  size?: number | string
  wrap?: boolean
  fill?: boolean
  alignment?: 'stretch' | 'center' | 'flex-start' | 'flex-end' | 'baseline'
}
