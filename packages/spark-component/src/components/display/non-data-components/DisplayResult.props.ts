import type { SparkChildrenProps } from '../../shared-types'

export interface RResultProps extends SparkChildrenProps<'r-result'> {
icon?: 'success' | 'warning' | 'info' | 'error'
  title?: string
  subTitle?: string
}
