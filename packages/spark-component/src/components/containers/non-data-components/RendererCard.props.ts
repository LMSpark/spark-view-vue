import type { SparkChildrenProps } from '../../shared-types'

export interface RCardProps extends SparkChildrenProps<'r-card'> {
  header?: string
  shadow?: 'always' | 'hover' | 'never'
  bodyStyle?: object | string
  bodyClass?: string
}
